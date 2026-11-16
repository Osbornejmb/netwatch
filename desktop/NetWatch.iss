[Setup]
AppId=NetWatch.Desktop
AppName=NetWatch
AppVersion={#NetWatchVersion}
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
OutputDir={#NetWatchOutput}
OutputBaseFilename=NetWatch-{#NetWatchVersion}-Windows-x64-Setup
Compression=lzma2
SolidCompression=yes

[Files]
Source: "{#NetWatchPayload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{userprograms}\NetWatch"; Filename: "{app}\NetWatch.exe"; WorkingDir: "{app}"
