# SynapseHealer Demo Video — Render & Publish

## Prerequisites (install locally)

```bash
# Manim Community Edition v0.20+
pip install manim

# LaTeX (for MathTex, though this script uses Text only)
sudo apt install texlive-full   # Linux
# or: brew install mactex       # macOS

# ffmpeg (for stitching + audio mux)
sudo apt install ffmpeg         # Linux
# or: brew install ffmpeg       # macOS
```

## Render draft (fast)

```bash
cd /mnt/Development/Linux/repo/synapse-healer/video
manim -ql script.py Scene1_Title Scene2_Problem Scene3_Pipeline Scene4_Spine Scene5_Routing Scene6_Wallet Scene7_Telemetry Scene8_Closing Scene9_Outro
```

## Render production (1080p60)

```bash
manim -qh script.py Scene1_Title Scene2_Problem Scene3_Pipeline Scene4_Spine Scene5_Routing Scene6_Wallet Scene7_Telemetry Scene8_Closing Scene9_Outro
```

## Stitch scenes into final.mp4

```bash
ffmpeg -y -f concat -safe 0 -i concat.txt -c copy final_raw.mp4
```

## Add voiceover (replace with your voice clone audio)

```bash
# If you have a voice-over WAV/MP3 from your voice-clone provider:
ffmpeg -y -i final_raw.mp4 -i voiceover.wav -c:v copy -c:a aac -b:a 192k -shortest final_with_audio.mp4

# Add subtitles (optional, from subcaption data Manim can export):
# ffmpeg -y -i final_with_audio.mp4 -vf subtitles=subs.srt final.mp4
```

## YouTube export

```bash
ffmpeg -y -i final_with_audio.mp4 -c:v libx264 -crf 18 -preset slow -c:a aac -b:a 192k -movflags +faststart synapse-healer-demo-1080p.mp4
```

## Notes

- **Voice clone:** Hermes `text_to_speech` uses configured providers (edge/openai), not your personal voice clone. Generate the VO with your own voice-clone tool (ElevenLabs, OpenAI TTS with your voice, etc.), then mux with ffmpeg above.
- **Hyperframes:** No such skill exists in the Hermes catalog. This plan uses Manim CE only, per the `manim-video` skill.
- **Scene durations** in `plan.md` total ~100 seconds of visuals plus outro; adjust `self.wait()` calls in `script.py` if you need to hit exactly 120s.
