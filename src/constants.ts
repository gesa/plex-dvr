const CCEXTRACTOR_ARGS = [
  "-in=ts",
  "-out=srt",
  "--nofontcolor",
  "--notypesetting",
  "-noru",
  "--splitbysentence",
];
const COMSKIP_OPTS = ["--pid=0100", "--ts", "--hwassist"];
const COMCUT_OPTS = ["--keep-meta"];
const FFMPEG_OPTS = ["-map_metadata", "1", "-c", "copy"];
const HANDBRAKE_OPTS = [
  "--srt-lang",
  "eng",
  "--srt-codeset",
  "UTF-8",
];

export {
  CCEXTRACTOR_ARGS,
  COMCUT_OPTS,
  COMSKIP_OPTS,
  FFMPEG_OPTS,
  HANDBRAKE_OPTS,
};
