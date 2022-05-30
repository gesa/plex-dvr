import {
  promises,
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "fs";
import path from "path";
import { tmpdir } from "os";
import { Command, Flags, Errors } from "@oclif/core";
import { Logger, loggers } from "winston";
import { spawnBinary } from "../../util";
import setUpLogger from "../../logger";
import {
  COMCUT_OPTS,
  COMSKIP_OPTS,
  CCEXTRACTOR_ARGS,
  FFMPEG_OPTS,
} from "../../constants";

type UserConfiguration = {
  encoder?: string;
  "encoder-preset"?: string;
  "ignore-quiet-time"?: boolean;
  "keep-original"?: boolean;
  "keep-temp"?: boolean;
  "quiet-time"?: string;
  "handbrake-presets-import"?: string;
  "handbrake-preset-name"?: string;
};

type Configuration = {
  "ignore-quiet-time": boolean;
  "keep-original": boolean;
  "keep-temp": boolean;
  [index: string]: string | boolean | undefined;
};

const { copyFile, writeFile, unlink, rm } = promises;
const { ExitError } = Errors;

const baseConfigOptions: Configuration = {
  encoder: undefined,
  "encoder-preset": undefined,
  "ignore-quiet-time": false,
  "keep-original": false,
  "keep-temp": false,
  "quiet-time": undefined,
  "handbrake-presets-import": undefined,
  "handbrake-preset-name": undefined,
};

export default class PlexDvr extends Command {
  private readonly lockFile: string = path.join(tmpdir(), "dvrProcessing.lock");

  private logger!: Logger;

  private level!: "silly" | "verbose" | "info";

  private userConfig: UserConfiguration = {};

  static usage = "[options] [FILE]";

  static examples = [
    "plex-dvr /path/to/video",
    "plex-dvr -q 22-06 -e vt_h264 /path/to/video",
  ];

  static flags = {
    version: Flags.version({ char: "V" }),
    encoder: Flags.string({
      char: "e",
      description:
        "Video encoder string to pass to Handbrake. Run `HandbrakeCLI --help' to see available encoders.",
    }),
    "encoder-preset": Flags.string({
      description:
        "Video encoder preset to pass to Handbrake. Run `HandbrakeCLI --encoder-preset-list <string encoder>' to see available presets.",
    }),
    help: Flags.help({ char: "h" }),
    "ignore-quiet-time": Flags.boolean({
      description:
        "Process file immediately without checking against quiet time hours.",
    }),
    "keep-original": Flags.boolean({
      allowNo: true,
      description:
        "Prevent original `.ts' file produced by Plex's DVR from being deleted. \u001B[1mDefault behavior is to delete\u001B[0m",
    }),
    "keep-temp": Flags.boolean({
      allowNo: true,
      description:
        "Prevent temporary working directory from being deleted. \u001B[1mDefault behavior is to delete\u001B[0m",
    }),
    "quiet-time": Flags.string({
      char: "q",
      description: `Quiet time, in the format of \`NN-NN' where NN is an hour on the 24-hour clock (0 being midnight, 23 being 11pm).`,
      exclusive: ["ignore-quiet-time"],
    }),
    "sample-config": Flags.boolean({
      description: "Print default config values and exit.",
    }),
    verbose: Flags.boolean({
      char: "v",
      description: "Verbose logging to the console.",
    }),
    debug: Flags.boolean({
      char: "d",
      description:
        "Include stdout and stderr from all tools in logs (overrides `verbose' flag)",
    }),
    "comskip-location": Flags.string({
      default: "comskip",
      description: "Comskip binary location",
    }),
    "comcut-location": Flags.string({
      default: "comcut",
      description: "Comcut binary location",
    }),
    "ccextractor-location": Flags.string({
      default: "ccextractor",
      description: "CCExtractor binary location",
    }),
    "ffmpeg-location": Flags.string({
      default: "ffmpeg",
      description: "ffmpeg binary location",
    }),
    "handbrake-location": Flags.string({
      default: "HandBrakeCLI",
      description: "Handbrake binary location",
    }),
    "handbrake-presets-import": Flags.string({
      char: "H",
      description:
        "Load Handbrake presets file. Defaults to whatever presets are available in the gui, or barring that, nothing.",
    }),
    "handbrake-preset-name": Flags.string({
      char: "P",
      description: "Name of preset to select from gui or supplied preset file",
    }),
    "bypass-comskip": Flags.boolean({
      hidden: true,
    }),
  };

  static args = [{ name: "file" }];

  async init() {
    const configFile = path.join(this.config.configDir, "config.json");
    const { flags } = await this.parse(PlexDvr);
    const { verbose, debug } = flags;

    if (flags["sample-config"]) {
      const sampleConfig = { ...baseConfigOptions, ...flags } as Configuration;

      delete sampleConfig["sample-config"];

      this.log(
        `${this.config.name} will look in ${this.config.configDir} for a config file (config.json) as well as a comskip.ini.`
      );
      this.log(
        JSON.stringify(
          sampleConfig,
          (k, v) => {
            if (v === undefined) return "";
            return v;
          },
          2
        )
      );

      this.exit(0);
    }

    this.level = debug ? "silly" : verbose ? "verbose" : "info";

    setUpLogger(this.config, this.level);

    this.logger = loggers.get("plex-dvr");

    this.logger.log("info", "plex-dvr has begun initialization");

    if (existsSync(configFile)) {
      this.userConfig = JSON.parse(readFileSync(configFile).toString());
    }
  }

  warn(input: string | Error) {
    this.logger.log("warn", input);

    return super.warn(input);
  }

  silly(message: string) {
    this.logger.log({ level: "silly", message });
  }

  info(message: string) {
    this.logger.log({ level: "info", message });
  }

  verbose(message: string) {
    this.logger.log({ level: "verbose", message });
  }

  exit(code?: number) {
    if (
      !this.argv.includes("--help") &&
      !this.argv.includes("--sample-config") &&
      existsSync(this.lockFile)
    ) {
      this.info("Exiting process, deleting lockfile.");
      unlinkSync(this.lockFile);
    }

    super.exit(code);
  }

  async run() {
    const {
      args: { file: originalFile },
      flags,
    } = await this.parse(PlexDvr);

    if (!existsSync(originalFile))
      this.error("File not found", { code: "404", exit: 1 });

    const options: Configuration = Object.assign(
      {},
      baseConfigOptions,
      this.userConfig,
      flags
    );

    for (const [key, value] of Object.entries(options)) {
      if (value === "") delete options[key];
    }

    const lockFile = this.lockFile;
    const deleteTemp = !options["keep-temp"];
    const deleteOriginal = !options["keep-original"];
    const workingDir = mkdtempSync(path.join(tmpdir(), "plex-"));
    const fileName = path.basename(originalFile, ".ts");
    const workingFile = path.join(workingDir, fileName);
    const comskipIniLocation = path.join(this.config.configDir, "comskip.ini");

    this.info(`DVR post-processing script started on "${fileName}"`);

    /**
     * The server fans are loud, only process video files when permitted.
     * Calculate quiet time math based on whether it crosses midnight. If
     * start and end hours are equal, returns false—not in quiet time.
     *
     * @return {Promise<void>} resolves with filename
     */
    const checkForQuietTime = (): Promise<void> => {
      this.verbose("Checking quiet time");

      const quietTime = options["quiet-time"]?.toString() ?? "00-00";
      const [qS, qE] = quietTime.split("-");

      if (
        !/\d{2}-\d{2}/.test(quietTime) ||
        options["ignore-quiet-time"] ||
        qS === qE
      ) {
        this.info(
          `There is no quiet time set, beginning processing of ${fileName} immediately.`
        );

        return Promise.resolve();
      }

      const quietStart = Number.parseInt(qS, 10);
      const quietEnd = Number.parseInt(qE, 10);

      function itIsQuietTime() {
        const currentHour = new Date().getHours();

        if (quietStart > quietEnd) {
          return currentHour >= quietStart || currentHour < quietEnd;
        }

        if (quietStart < quietEnd) {
          return currentHour >= quietStart && currentHour < quietEnd;
        }

        return false;
      }

      if (itIsQuietTime()) {
        this.info(`It’s quiet time, sleeping '${fileName}' until that's over.`);
      } else {
        this.info(
          `It's currently outside quiet time, beginning processing of ${fileName} immediately.`
        );

        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const quietTimeLockout = global.setInterval(() => {
          if (itIsQuietTime()) {
            this.verbose(
              `It’s quiet time, sleeping '${fileName}' for 15 minutes.`
            );
          } else {
            this.info(
              `Quiet time is over, let's get on with converting '${fileName}'.`
            );
            global.clearInterval(quietTimeLockout);

            return resolve();
          }
        }, 900_000);
      });
    };

    /**
     * The server is petite, only process one video at a time
     * @return {Promise<void>} Resolved promise after lockfile is gone
     * */
    const checkForLockFile = () => {
      const lockFilePresent = existsSync(lockFile);

      if (lockFilePresent) {
        if (Date.now() - statSync(lockFile).birthtimeMs > 86_400_000) {
          this.warn("DVR lockfile is stale. Deleting and moving on.");
          unlinkSync(lockFile);

          return Promise.resolve();
        }

        this.info("DVR lockfile currently exists, sleeping for 5 minutes.");
      } else {
        this.verbose("There is no lockfile, CPU is free, moving on.");

        return Promise.resolve();
      }

      const lockFileLockout = global.setInterval(() => {
        if (existsSync(lockFile)) {
          this.verbose(`Lockfile present, sleeping ${fileName} for 5 min.`);
        } else {
          this.info("DVR lockfile is gone, CPU is free, moving on.");
          global.clearInterval(lockFileLockout);

          return Promise.resolve();
        }
      }, 300_000);
    };

    process.on("unhandledRejection", () => {
      this.exit(1);
    });

    process.on("SIGINT", () => {
      this.exit(0);
    });

    await checkForQuietTime()
      .then(checkForLockFile)
      /**
       * Create DVR lockfile
       * */
      .then(() => {
        this.info(`Creating lock file for processing ${fileName}`);

        return writeFile(lockFile, `Lock file generated by ${fileName}\n`, {
          flag: "wx",
        });
      }, this.catch)
      /**
       * Copy original file into temporary directory
       * */
      .then(() => {
        this.verbose(`Copying original ts to ${workingDir}`);

        return copyFile(originalFile, `${workingFile}.ts`);
      }, this.catch)
      /**
       * Run Comskip to find commercials and generate metadata
       * */
      .then(() => {
        /**
         * Plex's setting of this var torpedoes ffmpeg that's been compiled w/qsv
         * unset -v LD_LIBRARY_PATH
         * */
        delete process.env.LD_LIBRARY_PATH;

        if (options["bypass-comskip"]) {
          return;
        }

        COMSKIP_OPTS.push(
          `--ini="${comskipIniLocation}"`,
          `--output="${workingDir}"`,
          `--output-filename="${fileName}"`,
          `"${workingFile}.ts"`
        );

        this.info(`Running ComSkip on '${fileName}'`);

        return spawnBinary(flags["comskip-location"], COMSKIP_OPTS);
      }, this.catch)
      /**
       * Run Comcut if there's an edl file denoting chapter boundaries.
       * If there isn't, create a blank ffmeta file that would have been
       * output by Comcut.
       * */
      .then(() => {
        if (existsSync(`${workingFile}.edl`)) {
          this.info(`Commercials detected! Running Comcut on ${fileName}`);

          COMCUT_OPTS.push(
            `--comskip-ini="${comskipIniLocation}"`,
            `--work-dir="${workingDir}"`,
            `"${workingFile}.ts"`
          );

          return spawnBinary(flags["comcut-location"], COMCUT_OPTS);
        }

        if (!options["bypass-comskip"]) {
          this.info("No commercials found");
        }

        this.verbose("Generating blank ffmeta");

        return writeFile(`${workingFile}.ffmeta`, ";FFMETADATA1");
      }, this.catch)
      /**
       * Run ccextractor to convert closed captions into subtitles.
       * */
      .then(() => {
        this.info(`Extracting subtitles for '${fileName}`);
        CCEXTRACTOR_ARGS.push(
          `"${workingFile}.ts"`,
          "-o",
          `"${workingFile}.srt"`
        );

        return spawnBinary(flags["ccextractor-location"], CCEXTRACTOR_ARGS);
      }, this.catch)
      .catch((error: void | number) => {
        const ccExtractorError = (message: string) =>
          this.error(message, {
            code: `${error}`,
            exit: error || 1,
            ref: "https://github.com/CCExtractor/ccextractor/blob/v0.88/src/lib_ccx/ccx_common_common.h",
            suggestions: [
              "You can find CCEXTRACTOR error codes defined on github",
            ],
          });

        switch (`${error}`) {
          case "0":
          case "10":
            return;
          case "2":
            return ccExtractorError("CCEXTRACTOR exited with no input files");
          case "3":
            return ccExtractorError(
              "CCEXTRACTOR exited with too many input files"
            );
          case "4":
          case "7":
            return ccExtractorError("CCEXTRACTOR exited due to bad parameters");
          case "9":
            return ccExtractorError("CCEXTRACTOR exited with help text");
          default:
            return ccExtractorError(`CCEXTRACTOR exited with code ${error}`);
        }
      })
      /**
       * Use ffmpeg to remux the transport stream into an mp4 with
       * chapter markers.
       * */
      .then(() => {
        const ffmpegOpts = [
          "-i",
          `"${workingFile}.ts"`,
          "-i",
          `"${workingFile}.ffmeta"`,
          ...FFMPEG_OPTS,
          `"${workingFile}.mp4"`,
        ];

        this.info("Remuxing ts file to mp4 and adding chapter markers");

        return spawnBinary(flags["ffmpeg-location"], ffmpegOpts);
      })
      /**
       * Transcode mp4 to mkv using handbrake. Do not include subtitles because
       * Handbrake cannot help but to convert them to SSA for some reason.
       * */
      .then(() => {
        const hbOptions = [];

        if (options["handbrake-presets-import"]) {
          hbOptions.push(
            "--preset-import-file",
            options["handbrake-presets-import"].toString()
          );
        } else {
          hbOptions.push("--preset-import-gui");
        }

        if (options["handbrake-preset-name"]) {
          hbOptions.push("--preset", `"${options["handbrake-preset-name"]}"`);
        }

        if (options.encoder) {
          hbOptions.push("--encoder", options.encoder.toString());
        }

        if (options["encoder-preset"]) {
          hbOptions.push(
            "--encoder-preset",
            options["encoder-preset"].toString()
          );
        }

        hbOptions.push(
          "-i",
          `"${workingFile}.mp4"`,
          "-o",
          `"${workingFile}.mkv"`
        );

        this.info(`Transcoding started on '${fileName}'`);

        return spawnBinary(flags["handbrake-location"], hbOptions);
      })
      .catch((error) =>
        this.error("HandBrakeCLI failed", {
          code: error,
          suggestions: [
            "Handbrake doesn't officially support being compiled with ffmpeg?",
          ],
        })
      )
      /**
       * Add SRT back to the transcoded mkv and output it to source directory
       * */
      .then(() => {
        this.info(
          `Remuxing '${fileName}' with subtitles; outputting back to ${path.dirname(
            originalFile
          )}`
        );
        return spawnBinary(flags["ffmpeg-location"], [
          "-i",
          `"${workingFile}.mkv"`,
          "-i",
          `"${workingFile}.srt"`,
          "-c",
          "copy",
          "-map_metadata",
          "0",
          "-map_metadata",
          "1",
          `"${path.join(path.dirname(originalFile), `${fileName}.mkv`)}"`,
        ]);
      }, this.catch)
      /**
       * Delete temporary directory, if applicable
       * */
      .then(() => {
        if (deleteTemp) {
          this.verbose("Deleting temp directory");

          return rm(workingDir, { recursive: true, force: true });
        }
      })
      /**
       * Delete original transport stream, if applicable
       * */
      .then(() => {
        if (deleteOriginal) {
          this.verbose("Deleting original ts");

          return unlink(originalFile);
        }
      })
      .catch(this.catch)
      .finally(() => {
        this.exit(0);
      });
  }

  async catch(error: Error) {
    if (error instanceof ExitError && error.oclif.exit === 0) {
      return;
    }

    if (this.logger) {
      this.logger.log("error", error);
    }

    return super.catch(error);
  }
}
