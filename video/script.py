from manim import *

# --- Shared palette (Neon tech) ---
BG = "#0A0A0A"
PRIMARY = "#00F5FF"
SECONDARY = "#FF00FF"
ACCENT = "#39FF14"
MONO = "Menlo"
DIM = "#888888"


class Scene1_Title(Scene):
    def construct(self):
        self.camera.background_color = BG

        title = Text(
            "SynapseHealer",
            font_size=64,
            color=PRIMARY,
            weight=BOLD,
            font=MONO,
        )
        subtitle = Text(
            "Autonomous Self-Healing DLQ on InterSystems IRIS AI Hub",
            font_size=28,
            color=DIM,
            font=MONO,
        )
        subtitle.next_to(title, DOWN, buff=0.6)

        kicker = Text(
            "Dead letters don't stay dead.",
            font_size=24,
            color=ACCENT,
            font=MONO,
        )
        kicker.next_to(subtitle, DOWN, buff=0.8)

        self.add_subcaption("Dead letters don't stay dead. Not anymore.", duration=2.5)
        self.play(Write(title), run_time=1.5)
        self.wait(0.8)
        self.play(Write(subtitle), run_time=1.0)
        self.wait(0.6)
        self.play(Write(kicker), run_time=0.8)
        self.wait(1.2)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene2_Problem(Scene):
    def construct(self):
        self.camera.background_color = BG

        header = Text("The DLQ Graveyard", font_size=40, color=PRIMARY, font=MONO)
        header.to_edge(UP, buff=0.5)
        self.add_subcaption(
            "A vendor renames a field with no warning. An EHR emits February 31st. "
            "HL7 segments arrive out of order.",
            duration=4.0,
        )

        dq_label = Text("Dead-Letter Queue", font_size=24, color=DIM, font=MONO)
        dq_label.to_edge(LEFT).shift(RIGHT * 1.0 + UP * 1.0)
        dq_box = Rectangle(width=3.2, height=4.2, color=RED, stroke_opacity=0.4)
        dq_box.next_to(dq_label, RIGHT, buff=0.4)
        dq_box.align_to(dq_label, UP)

        scenarios = [
            "PID/PV1 swapped (HL7)",
            "Invalid date 1985-02-31 (HL7)",
            "Unescaped pipe \\| (HL7)",
            'Stringified "$450.00" (JSON)',
            "client_uuid -> customer_id drift (JSON)",
            "Epoch millis timestamp (JSON)",
            "Corrupted array nesting (JSON)",
        ]

        boxes = VGroup()
        for i, text in enumerate(scenarios):
            b = Rectangle(width=2.8, height=0.5, color=RED, fill_opacity=0.15)
            t = Text(text, font_size=14, color=RED, font=MONO)
            t.move_to(b.get_center())
            group = VGroup(b, t)
            group.move_to(dq_box.get_center() + DOWN * (0.4 + i * 0.55))
            boxes.add(group)

        self.play(Write(header), run_time=1.0)
        self.wait(0.5)
        self.play(Write(dq_label), Create(dq_box), run_time=0.8)
        self.wait(0.4)

        for i, box in enumerate(boxes):
            self.play(FadeIn(box, scale=0.8), run_time=0.35)
            self.wait(0.15)

        self.wait(1.5)

        engineer = Text("Engineer + hex dump", font_size=20, color=SECONDARY, font=MONO)
        engineer.next_to(dq_box, DOWN, buff=0.6)
        self.play(Write(engineer), run_time=0.8)
        self.wait(1.5)

        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene3_Pipeline(Scene):
    def construct(self):
        self.camera.background_color = BG

        nodes = [
            ("Synapse.Adapter.DeadLetterInbound", "Embedded Python chaos generator", PRIMARY),
            ("Synapse.Process.DeadLetterHealerBP", "The arbitrator", SECONDARY),
            ("Synapse.Agent.DeadLetterHealerAgent", "%AI.Agent + HealerToolSet", ACCENT),
        ]

        y = 0
        prev = None
        for name, desc, color in nodes:
            box = RoundedRectangle(width=4.6, height=1.1, corner_radius=0.12, color=color)
            t1 = Text(name, font_size=18, color=color, weight=BOLD, font=MONO)
            t2 = Text(desc, font_size=14, color=DIM, font=MONO)
            t2.next_to(t1, DOWN, buff=0.12, aligned_edge=LEFT)
            grp = VGroup(t1, t2)
            grp.move_to(box.get_center())
            node = VGroup(box, grp)
            node.move_to(np.array([prev[0].get_center()[0] + 5.2 if prev else -5.2, y, 0]))
            self.add_subcaption(
                f"{name.split('.')[-1]} — {desc}.", duration=2.2
            )
            self.play(Create(node), run_time=0.9)
            self.wait(0.4)
            if prev:
                arrow = Arrow(
                    prev[0].get_right(),
                    node.get_left(),
                    color=DIM,
                    buff=0.2,
                    stroke_width=2,
                )
                self.play(Create(arrow), run_time=0.5)
            prev = (node,)
            self.wait(0.3)

        branch_label = Text(
            "Tri-branch router: AUTO_HEAL / HUMAN_WORKFLOW / QUARANTINE",
            font_size=18,
            color=ACCENT,
            font=MONO,
        )
        branch_label.next_to(prev[0], DOWN, buff=0.9)
        self.play(Write(branch_label), run_time=0.8)
        self.wait(1.6)

        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene4_Spine(Scene):
    def construct(self):
        self.camera.background_color = BG

        title = Text("The Three-Step Spine", font_size=40, color=PRIMARY, font=MONO)
        title.to_edge(UP, buff=0.5)
        self.add_subcaption(
            "The agent runs exactly three governed calls: search the runbook RAG index, "
            "validate the repair, then calculate risk.",
            duration=4.5,
        )

        steps = [
            ("1. SearchRunbookRAG", "VECTOR_COSINE, 384-dim, ~42ms", PRIMARY),
            ("2. ValidateRepairedPayload", "HL7 v2 / JSON syntax check, ~56ms", SECONDARY),
            ("3. CalculateRiskScore", "Clinical / financial risk, ~35ms", ACCENT),
        ]

        prev = None
        for i, (name, desc, color) in enumerate(steps):
            box = RoundedRectangle(width=4.2, height=1.4, corner_radius=0.12, color=color)
            box.move_to(np.array([i * 5.4 - 5.4, 0, 0]))
            t1 = Text(name, font_size=19, color=color, weight=BOLD, font=MONO)
            t2 = Text(desc, font_size=14, color=DIM, font=MONO)
            t2.next_to(t1, DOWN, buff=0.14, aligned_edge=LEFT)
            t1.move_to(box.get_center() + UP * 0.25)
            t2.move_to(box.get_center() + DOWN * 0.25)
            grp = VGroup(box, t1, t2)

            timer = Text("sub-45ms", font_size=16, color=ACCENT, font=MONO)
            timer.next_to(box, DOWN, buff=0.25)

            self.play(Create(grp), Write(timer), run_time=0.9)
            self.wait(0.5)
            if prev:
                arrow = Arrow(
                    prev[0].get_right(),
                    box.get_left(),
                    color=DIM,
                    buff=0.2,
                    stroke_width=2,
                )
                self.play(Create(arrow), run_time=0.5)
            prev = (box,)
            self.wait(0.4)

        verified = Text(
            "Every step verified before resubmission.",
            font_size=20,
            color=ACCENT,
            font=MONO,
        )
        verified.next_to(steps[-1][0] and VGroup(), DOWN, buff=1.4)
        verified.shift(DOWN * 0.2)
        self.play(Write(verified), run_time=0.8)
        self.wait(1.6)

        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene5_Routing(Scene):
    def construct(self):
        self.camera.background_color = BG

        center = Circle(radius=0.6, color=PRIMARY)
        agent = Text("Agent", font_size=18, color=PRIMARY, weight=BOLD, font=MONO)
        agent.move_to(center.get_center())
        node = VGroup(center, agent)
        node.move_to(ORIGIN)
        self.add_subcaption(
            "High confidence, low risk goes to auto-heal. Ambiguous clinical data goes "
            "to human workflow. Corrupted payload goes to quarantine.",
            duration=5.0,
        )
        self.play(Create(node), run_time=0.8)
        self.wait(0.4)

        branches = [
            ("AUTO_HEAL", ACCENT, np.array([3.6, 1.8, 0]), "ResubmitDeliveryOp"),
            ("HUMAN_WORKFLOW", "#FFA500", np.array([0, -2.4, 0]), "WorkflowEscalationOp"),
            ("QUARANTINE", RED, np.array([-3.6, 1.8, 0]), "QuarantineVaultOp"),
        ]

        for label, color, pos, op in branches:
            box = RoundedRectangle(width=2.6, height=0.9, corner_radius=0.1, color=color)
            box.move_to(pos)
            t = Text(label, font_size=16, color=color, weight=BOLD, font=MONO)
            t.move_to(box.get_center() + UP * 0.15)
            op_t = Text(op, font_size=12, color=DIM, font=MONO)
            op_t.move_to(box.get_center() + DOWN * 0.2)
            grp = VGroup(box, t, op_t)

            arrow = Arrow(node.get_right() if pos[0] > 0 else node.get_left(), box.get_left() if pos[0] > 0 else box.get_right(), color=color, buff=0.15, stroke_width=2)
            if pos[0] == 0:
                arrow = Arrow(node.get_bottom(), box.get_top(), color=color, buff=0.15, stroke_width=2)

            self.play(Create(arrow), Create(grp), run_time=0.7)
            self.wait(0.3)

        self.wait(1.4)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene6_Wallet(Scene):
    def construct(self):
        self.camera.background_color = BG

        env = Text(".env", font_size=20, color=DIM, font=MONO)
        env.to_edge(LEFT).shift(UP * 1.5)
        arrow1 = Arrow(env.get_right(), env.get_right() + RIGHT * 1.2, color=DIM, buff=0.1)
        store = Text(
            "Synapse.Config.AIHubSetup.StoreWalletSecret",
            font_size=16,
            color=PRIMARY,
            font=MONO,
        )
        store.next_to(arrow1.get_end(), RIGHT, buff=0.2)
        wallet = RoundedRectangle(width=3.4, height=1.6, corner_radius=0.1, color=ACCENT)
        wallet.next_to(store, RIGHT, buff=0.4)
        wallet_t = Text("IRIS Wallet (%Wallet.KeyValue)", font_size=14, color=ACCENT, font=MONO)
        wallet_t.move_to(wallet.get_center() + UP * 0.25)
        wallet_key = Text("SynapseSecrets.LLMKey", font_size=12, color=DIM, font=MONO)
        wallet_key.move_to(wallet.get_center() + DOWN * 0.25)

        self.add_subcaption(
            "API keys never touch plaintext logs. They're written into the IRIS Wallet "
            "at startup and referenced through env indirection.",
            duration=4.0,
        )
        self.play(Write(env), Create(arrow1), run_time=0.7)
        self.wait(0.3)
        self.play(Write(store), run_time=0.8)
        self.wait(0.3)
        self.play(Create(wallet), Write(wallet_t), Write(wallet_key), run_time=0.9)
        self.wait(0.4)

        redacted = Text("████████████████", font_size=16, color=RED, font=MONO)
        redacted.next_to(wallet, DOWN, buff=0.5)
        self.play(Write(redacted), run_time=0.6)
        self.wait(1.5)

        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene7_Telemetry(Scene):
    def construct(self):
        self.camera.background_color = BG

        table_title = Text("Synapse.Data.AuditTelemetry", font_size=22, color=PRIMARY, font=MONO)
        table_title.to_edge(UP, buff=0.5)

        rows = [
            ("Prompt tokens", "479", PRIMARY),
            ("Completion tokens", "176", SECONDARY),
            ("Cost per heal", "$0.00018", ACCENT),
            ("Latency", "~145 ms", DIM),
            ("Auto-heal rate", "90 %", ACCENT),
        ]

        y = 1.2
        prev = None
        for label, value, color in rows:
            row = VGroup()
            l = Text(label, font_size=18, color=DIM, font=MONO)
            v = Text(value, font_size=20, color=color, weight=BOLD, font=MONO)
            v.next_to(l, RIGHT, buff=1.0)
            row.add(l, v)
            row.move_to(np.array([-2.0, y, 0]))
            self.play(FadeIn(row), run_time=0.45)
            self.wait(0.25)
            prev = row
            y -= 0.62

        self.add_subcaption(
            "Four hundred seventy-nine prompt tokens, one seventy-six completion, "
            "zero point zero zero zero one eight dollars per heal.",
            duration=5.0,
        )
        self.wait(1.2)

        replay = Text("Replay mode: zero tokens. Zero cost.", font_size=18, color=ACCENT, font=MONO)
        replay.next_to(prev, DOWN, buff=0.8)
        self.play(Write(replay), run_time=0.7)
        self.wait(1.4)

        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene8_Closing(Scene):
    def construct(self):
        self.camera.background_color = BG

        line = Text(
            "It's not magic.",
            font_size=32,
            color=PRIMARY,
            weight=BOLD,
            font=MONO,
        )
        line2 = Text(
            "It's governed tool calls, deterministic validation,",
            font_size=24,
            color=DIM,
            font=MONO,
        )
        line2.next_to(line, DOWN, buff=0.5)
        line3 = Text(
            "and a telemetry table that actually gets read.",
            font_size=24,
            color=DIM,
            font=MONO,
        )
        line3.next_to(line2, DOWN, buff=0.3)

        self.add_subcaption(
            "It's not magic. It's governed tool calls, deterministic validation, "
            "and a telemetry table that actually gets read.",
            duration=4.0,
        )
        self.play(Write(line), run_time=1.2)
        self.wait(0.5)
        self.play(Write(line2), run_time=0.9)
        self.wait(0.2)
        self.play(Write(line3), run_time=0.9)
        self.wait(2.0)

        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene9_Outro(Scene):
    def construct(self):
        self.camera.background_color = BG

        repo = Text(
            "github.com/josephjbassey/synapse-healer",
            font_size=24,
            color=PRIMARY,
            font=MONO,
        )
        oe = Text(
            "Open Exchange: synapse-healer  |  +11 Contest Bonus Points",
            font_size=18,
            color=ACCENT,
            font=MONO,
        )
        oe.next_to(repo, DOWN, buff=0.5)

        self.play(Write(repo), run_time=1.0)
        self.wait(0.4)
        self.play(Write(oe), run_time=0.8)
        self.wait(2.2)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)
