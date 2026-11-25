[Setup]
AppId=NetWatch.Desktop
AppName=NetWatch
AppVersion={#NetWatchVersion}
VersionInfoVersion={#NetWatchVersion}
DefaultDirName={localappdata}\Programs\NetWatch
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
AppMutex=Local\NetWatch.InstalledDesktop
CloseApplications=no
UninstallDisplayIcon={app}\NetWatch.exe
SetupIconFile=NetWatch.ico
OutputDir={#NetWatchOutput}
OutputBaseFilename=NetWatch-{#NetWatchVersion}-Windows-x64-Setup
Compression=lzma2
SolidCompression=yes

[Files]
Source: "{#NetWatchPayload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{userprograms}\NetWatch"; Filename: "{app}\NetWatch.exe"; WorkingDir: "{app}"

[Tasks]
Name: sharing; Description: "Set up access from another PC on my private network"; GroupDescription: "Choose how to use NetWatch"; Flags: unchecked

[Run]
Filename: "{app}\NetWatch.exe"; Parameters: "--setup-sharing"; Tasks: sharing; Flags: skipifsilent; StatusMsg: "Preparing access from another PC..."
