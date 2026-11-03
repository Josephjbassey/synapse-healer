#!/usr/bin/env python3
"""
SynapseHealer Automated Video Walkthrough Generator
Captures high-resolution frames of live scenario execution and compiles
a contest-ready MP4 walkthrough and animated GIF.
"""

import os
import subprocess
import time
import json
import urllib.request

DEMO_DIR = "/mnt/Development/Linux/repo/synapse-healer/docs/demo"
FRAMES_DIR = "/tmp/synapse_video_frames"
os.makedirs(DEMO_DIR, exist_ok=True)
os.makedirs(FRAMES_DIR, exist_ok=True)

def run_cmd(cmd):
    print(f">> Running: {cmd}")
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Warning / Error: {res.stderr}")
    return res.stdout.strip()

def inject_scenario(scenario_id):
    url = "http://localhost:52773/api/synapse/inject"
    data = json.dumps({"scenarioId": scenario_id}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = response.read().decode('utf-8')
            print(f"Injected Scenario {scenario_id} -> {res_body[:100]}...")
            return json.loads(res_body)
    except Exception as e:
        print(f"Failed to inject scenario {scenario_id}: {e}")
        return None

def capture_screenshot(url, output_path, wait_sec=2):
    cmd = (
        f'chromium --headless=new --no-sandbox --disable-gpu '
        f'--window-size=1920,1080 --screenshot="{output_path}" "{url}"'
    )
    run_cmd(cmd)
    time.sleep(wait_sec)
    if os.path.exists(output_path):
        size_kb = os.path.getsize(output_path) / 1024
        print(f"Captured: {output_path} ({size_kb:.1f} KB)")
    else:
        print(f"Error: {output_path} was not created!")

def main():
    print("=== SYNAPSE HEALER VIDEO WALKTHROUGH PIPELINE ===")

    # Step 1: Capture Initial Executive Hero & Bento Grid
    print("\n1. Capturing Executive Overview...")
    inject_scenario(1)
    time.sleep(1)
    capture_screenshot("http://localhost:3000", f"{FRAMES_DIR}/01_hero_overview.png", 2)

    # Step 2: Capture Scenario 1 (HL7 PV1/PID Segment Re-sequence)
    print("\n2. Capturing Scenario 1 (HL7 Inversion Healed)...")
    inject_scenario(1)
    time.sleep(1)
    capture_screenshot("http://localhost:3000", f"{FRAMES_DIR}/02_hl7_healed.png", 2)

    # Step 3: Capture Scenario 4 (JSON Quoted Numbers & Type Coercion)
    print("\n3. Capturing Scenario 4 (JSON Type Coercion)...")
    inject_scenario(4)
    time.sleep(1)
    capture_screenshot("http://localhost:3000", f"{FRAMES_DIR}/03_json_healed.png", 2)

    # Step 4: Capture Scenario 2 (HL7 Invalid Date -> Human Workflow Escalation)
    print("\n4. Capturing Scenario 2 (Human Workflow Escalation)...")
    inject_scenario(2)
    time.sleep(1)
    capture_screenshot("http://localhost:3000", f"{FRAMES_DIR}/04_hitl_escalation.png", 2)

    # Step 5: Capture Human Workflow Queue Tab (With Expanded Payload Diff)
    print("\n5. Capturing Human Workflow Approval Queue Tab...")
    capture_screenshot("http://localhost:3000/?tab=queue&preview=true", f"{FRAMES_DIR}/05_workflow_queue.png", 2)

    # Step 6: Capture IRIS Vector Search Runbooks Tab (10 Vector-Indexed Rules)
    print("\n6. Capturing IRIS Vector Search Runbooks Tab...")
    capture_screenshot("http://localhost:3000/?tab=rag", f"{FRAMES_DIR}/06_vector_runbooks.png", 2)

    # Step 7: Capture Live Audit Telemetry Tab
    print("\n7. Capturing Live Audit Telemetry Ledger...")
    capture_screenshot("http://localhost:3000/?tab=history", f"{FRAMES_DIR}/07_audit_telemetry.png", 2)

    # Verify all frames exist
    scenes = [
        "01_hero_overview.png",
        "02_hl7_healed.png",
        "03_json_healed.png",
        "04_hitl_escalation.png",
        "05_workflow_queue.png",
        "06_vector_runbooks.png",
        "07_audit_telemetry.png"
    ]
    
    for s in scenes:
        p = f"{FRAMES_DIR}/{s}"
        if not os.path.exists(p):
            print(f"Missing frame {p}! Aborting.")
            return

    # Step 8: Build High-Quality MP4 Video using ffmpeg
    print("\n8. Generating Video Walkthrough via ffmpeg...")
    mp4_out = f"{DEMO_DIR}/synapse-healer-walkthrough.mp4"
    gif_out = f"{DEMO_DIR}/synapse-healer-demo.gif"

    # Create an input list for ffmpeg with durations
    input_list_file = f"{FRAMES_DIR}/input_list.txt"
    with open(input_list_file, "w") as f:
        # Scene 1: 5s
        f.write(f"file '{FRAMES_DIR}/01_hero_overview.png'\nduration 4\n")
        # Scene 2: 5s
        f.write(f"file '{FRAMES_DIR}/02_hl7_healed.png'\nduration 4\n")
        # Scene 3: 4s
        f.write(f"file '{FRAMES_DIR}/03_json_healed.png'\nduration 4\n")
        # Scene 4: 5s
        f.write(f"file '{FRAMES_DIR}/04_hitl_escalation.png'\nduration 4\n")
        # Scene 5: 5s
        f.write(f"file '{FRAMES_DIR}/05_workflow_queue.png'\nduration 4\n")
        # Scene 6: 4s
        f.write(f"file '{FRAMES_DIR}/06_vector_runbooks.png'\nduration 4\n")
        # Scene 7: 4s
        f.write(f"file '{FRAMES_DIR}/07_audit_telemetry.png'\nduration 4\n")
        f.write(f"file '{FRAMES_DIR}/01_hero_overview.png'\n")

    # Render MP4 (1080p, H.264, 25fps)
    cmd_mp4 = (
        f"ffmpeg -y -f concat -safe 0 -i {input_list_file} "
        f"-vf \"fps=25,format=yuv420p\" "
        f"-c:v libx264 -crf 18 -preset fast {mp4_out}"
    )
    run_cmd(cmd_mp4)

    # Render optimized preview GIF (800x450, 10fps)
    print("\n9. Generating Optimized Preview GIF...")
    cmd_gif = (
        f"ffmpeg -y -i {mp4_out} "
        f"-vf \"fps=8,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer\" "
        f"{gif_out}"
    )
    run_cmd(cmd_gif)

    print("\n=== GENERATION COMPLETE ===")
    if os.path.exists(mp4_out):
        print(f"MP4 Video created: {mp4_out} ({os.path.getsize(mp4_out)/1024/1024:.2f} MB)")
    if os.path.exists(gif_out):
        print(f"GIF Preview created: {gif_out} ({os.path.getsize(gif_out)/1024/1024:.2f} MB)")

if __name__ == "__main__":
    main()
