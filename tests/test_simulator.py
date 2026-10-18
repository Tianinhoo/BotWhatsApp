"""[ByCodex] Pruebas de aceptación del chat local; compatibles con pytest/unittest.

Ejecutan la CLI de verdad y guardan todos los logs en carpetas temporales.
No requieren credenciales, base de datos, WhatsApp ni paquetes Python extra.
"""

import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = PROJECT_ROOT / "scripts" / "simulate_chat.py"
SCENARIOS = (
    "menu_completo",
    "seleccion_prenda",
    "handoff",
    "fuera_de_guion",
    "abandono_regreso",
    "duplicado",
    "opcion_invalida",
    "audio",
    "emoji",
    "typos",
)


class SimulatorCLITest(unittest.TestCase):
    def setUp(self):
        self.logs = tempfile.TemporaryDirectory(prefix="cecilia-simulator-")
        self.addCleanup(self.logs.cleanup)

    def run_simulator(self, *arguments, inputs="", env_updates=None):
        env = os.environ.copy()
        for key in (
            "APP_SECRET", "WHATSAPP_TOKEN", "PHONE_NUMBER_ID", "VERIFY_TOKEN",
            "DATABASE_URL", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD",
        ):
            env.pop(key, None)
        env.update({"PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"})
        if env_updates:
            env.update(env_updates)
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--log-dir", self.logs.name, *arguments],
            input=inputs,
            capture_output=True,
            encoding="utf-8",
            errors="strict",
            cwd=PROJECT_ROOT,
            env=env,
            timeout=60,
            check=False,
        )

    def assert_succeeded(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + "\n" + result.stderr)
        self.assertNotIn("Traceback", result.stdout + result.stderr)

    def test_auto_runs_all_ten_scenarios_without_credentials(self):
        result = self.run_simulator("--auto")
        self.assert_succeeded(result)
        self.assertIn("10/10 escenarios aprobados", result.stdout)
        self.assertNotIn("❌", result.stdout)
        for name in SCENARIOS:
            with self.subTest(scenario=name):
                self.assertRegex(result.stdout, rf"(?m)^.*✅.*\b{re.escape(name)}\b.*$")

    def test_named_scenarios_accept_the_documented_spanish_aliases(self):
        for alias, expected in (
            ("modelo 2 talla M negro", "Modelo 2"),
            ("quiero asesora", "asesora humana"),
            ("fuera de menú", "aún no puedo interpretar mensajes libres"),
        ):
            with self.subTest(alias=alias):
                result = self.run_simulator("--scenario", alias)
                self.assert_succeeded(result)
                self.assertIn("✅", result.stdout)
                self.assertIn(expected, result.stdout)
                self.assertNotIn("❌", result.stdout)

    def test_interactive_selection_handoff_and_silence(self):
        result = self.run_simulator(
            inputs="1\n#lista 2\n#boton 3\nhola\n#estado\n#salir\n"
        )
        self.assert_succeeded(result)
        self.assertIn("Cecilia Tedin", result.stdout)
        self.assertIn("╭", result.stdout)
        self.assertIn("│", result.stdout)
        self.assertIn("╰", result.stdout)
        self.assertIn("Elegiste *Modelo 2*", result.stdout)
        handoff = "¡Perfecto! Te derivamos con una *asesora humana*."
        self.assertEqual(result.stdout.count(handoff), 1)
        after_handoff = result.stdout.split(handoff, 1)[1]
        self.assertIn("PAUSED_HUMAN", after_handoff)
        self.assertNotIn("¿En qué puedo ayudarte hoy?", after_handoff)
        self.assertNotIn("Perdón, aún no puedo interpretar", after_handoff)

    def test_session_log_preserves_chat_and_unicode(self):
        incoming = "presio del vestidito plis 😅"
        result = self.run_simulator(inputs=incoming + "\n#salir\n")
        self.assert_succeeded(result)
        log_files = list(Path(self.logs.name).glob("sim_*.txt"))
        self.assertEqual(len(log_files), 1)
        self.assertRegex(log_files[0].name, r"^sim_\d{8}_\d{6}\.txt$")
        transcript = log_files[0].read_text(encoding="utf-8")
        self.assertIn("Cecilia Tedin", transcript)
        self.assertIn(incoming, transcript)
        self.assertIn("aún no puedo interpretar mensajes libres", transcript)
        self.assertNotIn("\ufffd", transcript)

    def test_bad_interactive_commands_can_be_corrected_without_losing_chat(self):
        result = self.run_simulator(inputs=(
            "#lista 99\n#boton 1\n#esperar 99999999999999999999999999d\n"
            "#desconocido\n1\n#lista 2\n#reiniciar\n#estado\n#salir\n"
        ))
        self.assert_succeeded(result)
        self.assertIn("No existe esa opción visible", result.stdout)
        self.assertIn("Intervalo demasiado grande", result.stdout)
        self.assertIn("Comando desconocido", result.stdout)
        self.assertIn("Elegiste *Modelo 2*", result.stdout)
        fresh_chat = result.stdout.split("[Nueva conversación; memoria reiniciada]", 1)[1]
        self.assertIn('"state": "MENU"', fresh_chat)
        self.assertIn('"product_id": null', fresh_chat)

    def test_invalid_cli_requests_fail_cleanly(self):
        for arguments in (
            ("--scenario", "un_caso_que_no_existe"),
            ("--no-existe",),
            ("--auto", "--scenario", "handoff"),
        ):
            with self.subTest(arguments=arguments):
                result = self.run_simulator(*arguments)
                self.assertNotEqual(result.returncode, 0)
                combined = result.stdout + result.stderr
                self.assertTrue(combined.strip())
                self.assertNotIn("Traceback", combined)

    def test_invalid_external_configuration_does_not_prevent_local_chat(self):
        result = self.run_simulator(
            "--scenario", "quiero asesora",
            env_updates={
                "NODE_ENV": "production",
                "APP_SECRET": "simulator-invalid-secret",
                "WHATSAPP_TOKEN": "simulator-invalid-token",
                "PHONE_NUMBER_ID": "invalid-phone-id",
                "GRAPH_API_VERSION": "invalid-version",
                "DATABASE_URL": "postgres://invalid:invalid@127.0.0.1:1/no_database",
                "PGCONNECT_TIMEOUT": "1",
            },
        )
        self.assert_succeeded(result)
        self.assertIn("✅", result.stdout)
        self.assertIn("asesora humana", result.stdout)
        self.assertNotIn("ECONNREFUSED", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
