import Help from "@oclif/plugin-help";
import { Command } from "@oclif/config";

export default class extends Help {
  showCommandHelp(command: Command) {
    // eslint-disable-next-line no-console
    console.info(`\u001B[1mPLEX DVR POSTPROCESSING\u001B[0m
=======================
This script accepts a transport stream as an argument [FILE] and does
the following:

1. Copies the original ts to a subdirectory within the system tmpdir
2. Runs \`comskip\` to find commercial boundaries*. If found, it
    a. Deletes them using \`comcut\`
    b. Generates chapter boundaries at commercial breaks
3. Extracts closed captions as subtitles
4. Remuxes to mp4 to add chapter markers
5. Transcodes to mkv to compress and add subtitles
6. Cleans up after itself
    a. Deletes original ts
    b. Deletes temporary files
    c. Moves mkv to source directory (presumably .grab/)

It does all of this while respecting quiet hours and ensuring only one file
is being processed at a time. It also produces a verbose and an error log.

\u001B[1mPREREQUISITES\u001B[0m
comskip: https://github.com/erikkaashoek/Comskip
comcut: https://github.com/BrettSheleski/comchap
ccextractor: https://github.com/CCExtractor/ccextractor
ffmpeg: https://ffmpeg.org/
HandbrakeCLI: https://handbrake.fr/downloads.php

You can likely get some or all of these programs from your package manager.
`);

    return super.showCommandHelp(command);
  }
}
