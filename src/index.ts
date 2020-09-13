import {
  existsSync,
  mkdtempSync,
  promises,
  readFileSync,
  statSync,
  unlinkSync,
} from "fs";
import {inspect} from 'util';
import {basename, dirname, join} from "path";
import {tmpdir, type} from "os";
import {Command, flags} from "@oclif/command";
import {IConfig} from "@oclif/config";
import {transports} from "winston";
import {spawnBinary} from "./util";
import logger from "./logger";
import {
  COMCUT,
  COMCUT_OPTS,
  COMSKIP,
  COMSKIP_OPTS,
  CCEXTRACTOR,
  CCEXTRACTOR_ARGS,
  FFMPEG,
  FFMPEG_OPTS,
  HANDBRAKE,
  HANDBRAKE_OPTS,
} from "./constants";

const {copyFile, writeFile, unlink} = promises;
const baseConfigOptions = {
  encoder: type() === "Linux" ? "qsv_h265" : "Darwin" ? "vt_h264" : null,
  "encoder-preset": "default",
  "ignore-quiet-time": false,
  "keep-original": false,
  "keep-temp": false,
  "quiet-time": "03-12",
};


class PlexDvr extends Command {
  private readonly lockFile: string = join(tmpdir(), "dvrProcessing.lock");

  private userConfig: Record<string, string | boolean> = {};

  static usage = "[options] [FILE]";

  static description = `Plex DVR postprocessing script

Prerequisites:
comskip, comcut, ccextractor, ffmpeg, HandbrakeCLI

This script accepts a transport stream as argument [FILE] and does the
following:

1. Copies the original ts to a subdirectory within the system tmpdir
2. Runs \`comskip\` to find commercial boundaries. If found, it
  a. Deletes them using \`comcut\`
  b. Generates an edl file to create chapter boundaries at commercial breaks
3. Extracts closed captions as subtitles
4. Remuxes to mp4 to add chapter markers
5. Transcodes to mkv to compress and add subtitles
6. Cleans up after itself
  a. Deletes original ts
  b. Deletes temporary files
  c. Moves mkv to source directory (typically .grab/)

It does all of this while respecting quiet hours and ensuring only one file
is being processed at a time. It also produces detailed logs on its own and
adds begin/end lines to the PMS logs.

ffmpeg: https://ffmpeg.org/
comskip: https://github.com/erikkaashoek/Comskip
comcut: https://github.com/BrettSheleski/comchap
ccextractor: https://github.com/CCExtractor/ccextractor

You can probably get handbrake, ffmpeg, comskip, and ccextractor from your OS's
package manager.
`;

  static examples = [
    "plexdvr /path/to/video",
    "plexdvr -q 22-06 -e vt_h264 /path/to/video",
  ];

  static flags = {
    encoder: flags.string({
      char: "e",
      description:
        "Video encoder string to pass to Handbrake. Run `HandbrakeCLI --help' to see available encoders.",
    }),
    "encoder-preset": flags.string({
      description:
        "Video encoder preset to pass to Handbrake. Run `HandbrakeCLI --encoder-preset-list <string encoder>' to see available presets.",
    }),
    help: flags.help({char: "h"}),
    "ignore-quiet-time": flags.boolean({
      description:
        "Process file immediately without checking against quiet time hours.",
    }),
    "keep-original": flags.boolean({
      allowNo: true,
      description:
        "Prevent original `.ts' file produced by Plex's DVR from being deleted. Default is false, prepend with `--no-` to override local config.",
    }),
    "keep-temp": flags.boolean({
      allowNo: true,
      description: "Prevent temporary working directory from being deleted.  Default is false, prepend with `--no-` to override local config.",
    }),
    "quiet-time": flags.string({
      char: "q",
      description: `Quiet time, in the format of \`NN-NN' where NN is an hour on the 24-hour clock (0 being midnight, 23 being 11pm). Default value \`${baseConfigOptions["quiet-time"]}'`,
      exclusive: ["ignore-quiet-time"],
    }),
    "sample-config": flags.boolean({
      description:
        "Print default config values and exit.",
    }),
    verbose: flags.boolean({
      char: "v",
      description: "Verbose logging to the console.",
    }),
    debug: flags.boolean({
      char: "d",
      description:
        "Include stdout and stderr from all tools in logs (overrides `verbose' flag)",
    }),
  };

  static args = [{name: "file"}];

  constructor(argv: string[], config: IConfig) {
    super(argv, config);
  }

  async init() {
    const configFile = join(this.config.configDir, 'config.json');

    if (existsSync(configFile)) {
      this.userConfig = JSON.parse(readFileSync(configFile).toString());
    }
  }

  async run() {
    const {
      args: {file},
      flags,
    } = this.parse(PlexDvr);
    const options = {
      ...baseConfigOptions,
      ...this.userConfig,
      ...flags,
    };
    const {verbose, debug} = options;

    if (options["sample-config"]) {
      logger.info(
        `${this.config.name} will look for a config file at ${this.config.configDir}.`
      );
      logger.info(JSON.stringify(baseConfigOptions, null, 2));

      this.exit(0);
    }

    let quietTime = true;
    const lockFile = this.lockFile;
    const deleteTemp = !options["keep-temp"];
    const deleteOriginal = !options["keep-original"];
    const workingDir = mkdtempSync(join(tmpdir(), "plex-"));
    const fileName = basename(file, ".ts");
    const workingFile = join(workingDir, fileName);
    const [qS, qE] = options["quiet-time"].split("-");
    const quietStart = parseInt(qS, 10);
    const quietEnd = parseInt(qE, 10);

    logger.add(
      new transports.File({
        filename: join(this.config.dataDir, "plexDvrProcessing.log"),
        maxsize: 1000000,
        maxFiles: 10,
        tailable: true,
        zippedArchive: true,
        level: debug ? "silly" : verbose ? "verbose" : "info",
      })
    );
    logger.transports[0].level = debug ? "silly" : verbose ? "verbose" : "warn";

    logger.info(`DVR post-processing script started on "${fileName}"`);

    /**
     * The server fans are loud, only process video files when permitted.
     * Calculate quiet time math based on whether it crosses midnight. If
     * start and end hours are equal, returns false—not in quiet time.
     *
     * @param {string} file pretty filename for logging purposes
     * @return {Promise<void>} resolves with filename
     */
    function checkForQuietTime(file: string): Promise<string> {
      return new Promise((resolve) => {
        const currentHour = new Date().getHours();

        logger.verbose("Checking quiet time");

        if (options["ignore-quiet-time"] || quietStart === quietEnd) {
          logger.info(
            `There is no quiet time set, beginning processing of ${file} immediately.`
          );

          quietTime = false;

          return resolve(file);
        }

        const quietTimeLockout = global.setInterval(() => {
          logger.verbose("Beginning quiet time interval");

          if (quietStart > quietEnd) {
            quietTime = currentHour >= quietStart || currentHour < quietEnd;
          } else if (quietStart < quietEnd) {
            quietTime = currentHour >= quietStart && currentHour < quietEnd;
          }

          logger.verbose(`It ${quietTime ? "is" : "is not"} quiet time.`);

          if (quietTime) {
            logger.debug(`It's quiet time, sleeping '${file}' for 15 min.`);
          } else {
            logger.info(
              `Quiet time is over, let's get on with converting '${file}'.`
            );
            quietTime = false;
            global.clearInterval(quietTimeLockout);

            return resolve(file);
          }
        }, 900000);
      });
    }

    /**
     * The server is petite, only process one video at a time
     * @param {string} file pretty filename for logging
     * @return {Promise<void>} Resolved promise after lockfile is gone
     * */
    function checkForLockFile(file: string): Promise<void> {
      return new Promise((resolve) => {
        const lockFilePresent = existsSync(lockFile);

        if (
          lockFilePresent &&
          Date.now() - statSync(lockFile).birthtimeMs > 86400000
        ) {
          logger.warn("DVR lockfile is stale. Deleting and moving on.");
          unlinkSync(lockFile);

          return resolve();
        }

        if (lockFilePresent) {
          logger.info("DVR lockfile currently exists, sleeping for 5 minutes.");
        } else {
          logger.verbose("There is no lockfile, CPU is free, moving on.");

          return resolve();
        }

        const lockFileLockout = global.setInterval(() => {
          if (existsSync(lockFile)) {
            logger.verbose(`Lockfile present, sleeping ${file} for 5 min.`);
          } else {
            logger.info("DVR lockfile is gone, CPU is free, moving on.");
            global.clearInterval(lockFileLockout);

            return resolve();
          }
        }, 300000);
      });
    }

    await checkForQuietTime(fileName)
      .then(checkForLockFile)
      /**
       * Create DVR lockfile
       * */
      .then(() => {
        logger.info(`Creating lock file for processing ${fileName}`);

        return writeFile(lockFile, `Lock file generated by ${fileName}`, {
          flag: "wx",
        });
      })
      /**
       * Copy original file into temporary directory
       * */
      .then(() => {
        logger.verbose(`Copying original ts to ${workingDir}`);

        return copyFile(file, `${workingFile}.ts`);
      })
      /**
       * Run Comskip to find commercials and generate metadata
       * */
      .then(() => {
        /**
         * Plex's setting of this var torpedoes ffmpeg that's been compiled w/qsv
         * unset -v LD_LIBRARY_PATH
         * */
        COMSKIP_OPTS.push(
          `--output="${workingDir}"`,
          `--output-filename="${fileName}"`,
          `"${workingFile}.ts"`
        );
        delete process.env.LD_LIBRARY_PATH;

        logger.info(`Running ComSkip on '${fileName}'`);
        logger.verbose(`current command:\ncomskip ${COMSKIP_OPTS.join(" ")}`);

        return spawnBinary(COMSKIP, COMSKIP_OPTS);
      })
      /**
       * Run Comcut if there's an edl file denoting chapter boundaries.
       * If there isn't, create a blank ffmeta file that would have been
       * output by Comcut.
       * */
      .then(() => {
        if (existsSync(`${workingFile}.edl`)) {
          COMCUT_OPTS.push(`--work-dir="${workingDir}"`, `"${workingFile}.ts"`);

          logger.info(`Commercials detected! Running Comcut on ${fileName}`);
          logger.verbose(`current command:\ncomcut ${COMCUT_OPTS.join(" ")}`);

          return spawnBinary(COMCUT, COMCUT_OPTS);
        }

        logger.info("No commercials found");
        logger.verbose("generating faux ffmeta");

        return writeFile(`${workingFile}.ffmeta`, ";FFMETADATA1");
      })
      /**
       * Run ccextractor to convert closed captions into subtitles.
       * */
      .then(() => {
        logger.info(`Extracting subtitles for '${fileName}`);
        CCEXTRACTOR_ARGS.push(
          `"${workingFile}.ts"`,
          "-o",
          `"${workingFile}.srt"`
        );
        logger.verbose(
          `current command:\nccextractor ${CCEXTRACTOR_ARGS.join(" ")}`
        );

        return spawnBinary(CCEXTRACTOR, CCEXTRACTOR_ARGS);
      })
      .then((code: void | number) => {
        if (!code || code === 0 || code === 10) {
          return;
        }

        throw code;
      })
      .catch((code: string) => {
        const ccExtractorError = (message: string) => {
          return this.error(message, {
            code: code,
            exit: parseInt(code),
            ref: 'https://github.com/CCExtractor/ccextractor/blob/v0.88/src/lib_ccx/ccx_common_common.h',
            suggestions: [
              'You can find CCEXTRACTOR error codes defined on github'
            ]
          });
        };

        switch (code) {
          case '0':
          case '10':
            return Promise.resolve();
          case '2':
            ccExtractorError("CCEXTRACTOR exited with no input files")
          case '3':
            ccExtractorError("CCEXTRACTOR exited with too many input files")
          case '4':
          case '7':
            ccExtractorError("CCEXTRACTOR exited due to bad parameters")
          case '9':
            ccExtractorError("CCEXTRACTOR exited with help text")
          default:
            ccExtractorError(`CCEXTRACTOR exited with code ${code}`)
        }
      })
      /**
       * Use ffmpeg to remux the transport stream into an mp4 with
       * chapter markers.
       * */
      .then(() => {
        FFMPEG_OPTS.splice(
          0,
          0,
          "-i",
          `"${workingFile}.ts"`,
          "-i",
          `"${workingFile}.ffmeta"`
        );
        FFMPEG_OPTS.push(`"${workingFile}.mp4"`);

        logger.info("Remuxing ts file to mp4 and adding chapter markers");
        logger.verbose(`current command:\nffmpeg ${FFMPEG_OPTS.join(" ")}`);

        return spawnBinary(FFMPEG, FFMPEG_OPTS);
      })
      /**
       * Transcode mp4 to mkv using handbrake
       * */
      .then(() => {
        const hbOptions = HANDBRAKE_OPTS.map((option) => {
          if (option === "_VIDEO_ENCODER_") return options.encoder;
          if (options === "_VIDEO_PRESET_") return options["encoder-preset"];
          return option;
        });

        hbOptions.push(
          "--srt-file",
          `"${workingFile}.srt"`,
          "-i",
          `"${workingFile}.mp4"`,
          "-o",
          `"${workingFile}.mkv"`
        );

        logger.info(`Transcoding started on '${fileName}'`);
        logger.verbose(`current command:\nHandbrakeCLI ${hbOptions.join(" ")}`);

        return spawnBinary(HANDBRAKE, hbOptions);
      })
      .catch((code) => {
        this.error("HandbrakeCLI failed", {
          code,
          suggestions: [
            "Handbrake doesn't officially support being compiled with ffmpeg?",
          ],
        });
      })
      /**
       * Copy new mkv back to the original transport stream's directory
       * */
      .then(() => {
        logger.info(`Copying '${fileName}' back to grab dir`);

        return copyFile(`${workingFile}.mkv`, dirname(file));
      })
      /**
       * Delete temporary directory, if applicable
       * */
      .then(() => (deleteTemp ? unlink(workingDir) : null))
      /**
       * Delete original transport stream, if applicable
       * */
      .then(() => (deleteOriginal ? unlink(file) : null))
      /**
       * Delete lockfile, time to process the next one!v
       * */
      .then(() => unlink(lockFile))
      .catch(() => this.catch);
  }

  async catch(error: Error) {
    logger.error(error.message);

    if (existsSync(this.lockFile)) {
      logger.error("Deleting lockfile due to error.");
      unlinkSync(this.lockFile);
    }

    throw error;
  }
}

export = PlexDvr;
