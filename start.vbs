Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c node .", 0
Set WshShell = Nothing
