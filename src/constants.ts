const VIDEO_ENCODER = "vt_h264";
// const VIDEO_ENCODER='qsv_h265';
const CCEXTRACTOR = "/usr/local/bin/ccextractor";
const CCEXTRACTOR_ARGS = [
  "-in=ts",
  "-out=srt",
  "--nofontcolor",
  "--notypesetting",
  "-noru",
  "--splitbysentence",
];
const COMSKIP = "/usr/local/bin/comskip";
const COMSKIP_OPTS = ["--pid=0100", "--ts", "--hwassist"];
const COMCUT = "/usr/local/bin/comcut";
const COMCUT_OPTS = ["--keep-meta"];
const FFMPEG = "/usr/local/bin/ffmpeg";
const FFMPEG_OPTS = ["-map_metadata", "1", "-c", "copy"];
const HANDBRAKE = "/usr/local/bin/HandBrakeCLI";
const HANDBRAKE_OPTS = [
  "--markers",
  '--decomb="mode=39"',
  "--vb",
  "2500",
  "--rate",
  "30",
  "--pfr",
  "--encoder",
  "_VIDEO_ENCODER_",
  "--encoder-preset",
  "_VIDEO_PRESET_",
  "--audio-lang-list",
  "eng",
  "--first-audio",
  "-E",
  "copy",
  "--srt-lang",
  "eng",
  "--srt-codeset",
  "UTF-8",
];

export {
  CCEXTRACTOR,
  CCEXTRACTOR_ARGS,
  COMCUT,
  COMCUT_OPTS,
  COMSKIP,
  COMSKIP_OPTS,
  FFMPEG,
  FFMPEG_OPTS,
  HANDBRAKE,
  HANDBRAKE_OPTS,
  VIDEO_ENCODER,
};
