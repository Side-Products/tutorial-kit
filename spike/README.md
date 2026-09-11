# Capture experiments

These historical experiments document the capture measurements that informed `src/capture/`. They are not part
of the CLI or npm package and are not run by CI. Each script's opening comment explains its purpose.

They visit public Faceless pages, write to `spike/out/` or `spike/out4k/`, and may clear an earlier
experiment's outputs. Some open a headed browser. Use the local basic example for a repeatable introduction to
the toolkit. Rendering experiments require FFmpeg on `PATH`, or `TUTORIAL_FFMPEG_PATH`.
