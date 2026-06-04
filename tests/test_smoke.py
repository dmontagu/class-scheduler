from cjai import __version__
from cjai.cli import main


def test_version() -> None:
    assert __version__


def test_cli_runs(capsys) -> None:
    main([])
    out = capsys.readouterr().out
    assert "cjai" in out
