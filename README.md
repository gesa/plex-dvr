plex-dvr
========

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/plex-dvr.svg)](https://npmjs.org/package/plex-dvr)
[![Downloads/week](https://img.shields.io/npm/dw/plex-dvr.svg)](https://npmjs.org/package/plex-dvr)
[![License](https://img.shields.io/npm/l/plex-dvr.svg)](https://github.com/gesa/plex-dvr/blob/master/package.json)

# PLEX DVR POSTPROCESSING

This script accepts a transport stream as an argument [FILE] and does
the following:

1. Copies the original ts to a subdirectory within the system tmpdir
2. Runs `comskip` to find commercial boundaries*. If found, it
    1. Deletes them using `comcut`
    2. Generates chapter boundaries at commercial breaks
3. Extracts closed captions as subtitles
4. Remuxes to mp4 to add chapter markers
5. Transcodes to mkv to compress and add subtitles
6. Cleans up after itself
    1. Deletes original ts
    2. Deletes temporary files
    3. Moves mkv to source directory (presumably .grab/)

It does all of this while respecting quiet hours and ensuring only one file is being processed at a time. It also produces detailed logs on its own and adds begin/end lines to the PMS logs.

## PREREQUISITES

- **`ffmpeg`:** https://ffmpeg.org/
- **`comskip`:** https://github.com/erikkaashoek/Comskip
- **`comcut`:** https://github.com/BrettSheleski/comchap
- **`ccextractor`:** https://github.com/CCExtractor/ccextractor
- **`HandbrakeCLI`:** https://handbrake.fr/downloads.php

You can likely get some or all of these programs from your package manager.

## Using in Plex

As of Plex Media Server v1.19.3, the postprocessing script _must_ be called from the Scripts directory inside the application data directory. For easy setup, use [the quick start](https://github.com/gesa/plex-dvr-run).

## Usage

```shell script
$ plex-dvr [options] [FILE]
```

## Options

| option | type | description |
| :-: |:-: | --- |
| `--debug`, `-d` | | Include stdout and stderr from all tools in logs (overrides `verbose` flag) |
| `--encoder`, `-e` | string | Video encoder string to pass to Handbrake. Run `HandbrakeCLI --help` to see available encoders. |
| `--help`, `-h` | | show CLI help |
| `--quiet-time`, `-q` | string | Quiet time, in the format of `NN-NN` where NN is an hour on the 24-hour clock (0 being midnight, 23 being 11pm). Default value `03-12` |
| `--verbose`, `-v` |  | Verbose logging to the console. |
| `--encoder-preset` | string | Video encoder preset to pass to Handbrake. Run `HandbrakeCLI --encoder-preset-list <string encoder>` to see available presets. |
| `--ignore-quiet-time` | | Process file immediately without checking against quiet time hours. |
| `--[no-]keep-original` | | Prevent original `.ts` file produced by Plex's DVR from being deleted. Default is false, prepend with `--no-` to flip. |
| `--[no-]keep-temp` | | Prevent temporary working directory from being deleted.  Default is false, prepend with `--no-` to flip. |
| `--sample-config` | | Print default config values & config directory location and exit. |

## Examples

```shell script
plex-dvr /path/to/video
plex-dvr -q 22-06 -e vt_h264 /path/to/video
```
