; DataForeman Inno Setup Installer Script
; This script creates a Windows installer for DataForeman
; Requires Inno Setup 6.0 or later: https://jrsoftware.org/isinfo.php

#define MyAppName "DataForeman"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "DataForeman Project"
#define MyAppURL "https://github.com/orionK-max/DataForeman"
#define MyAppExeName "start-dataforeman.bat"

[Setup]
; NOTE: Generate a new GUID using Tools > Generate GUID in Inno Setup
; or use: powershell -Command "[guid]::NewGuid().ToString()"
AppId={{8F7A3B2C-4D5E-6F7A-8B9C-0D1E2F3A4B5C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=..\LICENSE
OutputDir=dist
OutputBaseFilename=DataForeman-Setup-{#MyAppVersion}
SetupIconFile=icon.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\windows-installer\icon.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Application files (exclude large directories)
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "node_modules,.git,logs,var,.github,.vscode,windows-installer\dist"
; Launcher scripts
Source: "start-dataforeman.bat"; DestDir: "{app}\windows-installer"; Flags: ignoreversion
Source: "stop-dataforeman.bat"; DestDir: "{app}\windows-installer"; Flags: ignoreversion
Source: "status-dataforeman.bat"; DestDir: "{app}\windows-installer"; Flags: ignoreversion
Source: "update.ps1"; DestDir: "{app}\windows-installer"; Flags: ignoreversion
Source: "install.ps1"; DestDir: "{app}\windows-installer"; Flags: ignoreversion
Source: "uninstall.ps1"; DestDir: "{app}\windows-installer"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}\windows-installer"; Flags: ignoreversion

[Icons]
; Start menu items
Name: "{group}\Start DataForeman"; Filename: "{app}\windows-installer\start-dataforeman.bat"; WorkingDir: "{app}"; Comment: "Start DataForeman services"
Name: "{group}\Stop DataForeman"; Filename: "{app}\windows-installer\stop-dataforeman.bat"; WorkingDir: "{app}"; Comment: "Stop DataForeman services"
Name: "{group}\Service Status"; Filename: "{app}\windows-installer\status-dataforeman.bat"; WorkingDir: "{app}"; Comment: "Check DataForeman service status"
Name: "{group}\Open Web Interface"; Filename: "http://localhost:8080"; Comment: "Open DataForeman in browser"
Name: "{group}\Documentation"; Filename: "{app}\README.md"; Comment: "View DataForeman documentation"
Name: "{group}\Configuration (.env)"; Filename: "{app}\.env"; Comment: "Edit DataForeman configuration"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

; Desktop shortcut
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\windows-installer\start-dataforeman.bat"; WorkingDir: "{app}"; Tasks: desktopicon; Comment: "Start DataForeman"

[Run]
; Run installation script
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\windows-installer\install.ps1"""; Flags: runhidden; StatusMsg: "Configuring DataForeman..."
; Offer to start DataForeman after installation
Filename: "{app}\windows-installer\start-dataforeman.bat"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent shellexec

[UninstallRun]
; Run uninstall script (asks user about data removal)
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\windows-installer\uninstall.ps1"""; Flags: runhidden; RunOnceId: "UninstallDataForeman"

[Code]
var
  DockerCheckPage: TOutputMsgWizardPage;

[Code]
var
  AdminEmailPage: TInputQueryWizardPage;
  AdminPasswordPage: TInputQueryWizardPage;

function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
  DockerInstalled: Boolean;
  DockerPath: String;
begin
  Result := True;
  DockerInstalled := False;
  
  // Check if Docker Desktop is installed
  if RegQueryStringValue(HKLM, 'SOFTWARE\Docker Inc.\Docker\1.0', 'InstallPath', DockerPath) or
     RegQueryStringValue(HKCU, 'SOFTWARE\Docker Inc.\Docker\1.0', 'InstallPath', DockerPath) or
     FileExists('C:\Program Files\Docker\Docker\Docker Desktop.exe') then
  begin
    DockerInstalled := True;
  end;
  
  if not DockerInstalled then
  begin
    if MsgBox('Docker Desktop is required but not installed.' + #13#10 + #13#10 +
              'DataForeman needs Docker Desktop to run.' + #13#10 + #13#10 +
              'Would you like to:' + #13#10 +
              '  • Download Docker Desktop now (Recommended)' + #13#10 +
              '  • Continue without Docker (you must install it later)' + #13#10 + #13#10 +
              'Click Yes to download Docker Desktop, or No to continue installation.',
              mbConfirmation, MB_YESNO) = IDYES then
    begin
      ShellExec('open', 'https://www.docker.com/products/docker-desktop/', '', '', SW_SHOW, ewNoWait, ResultCode);
      MsgBox('Please install Docker Desktop, then run this installer again.' + #13#10 + #13#10 +
             'Installation will now exit.', mbInformation, MB_OK);
      Result := False;
    end;
  end;
end;

procedure InitializeWizard();
begin
  DockerCheckPage := CreateOutputMsgPage(wpWelcome,
    'Docker Desktop Required',
    'DataForeman requires Docker Desktop to run',
    'This installer will set up DataForeman on your computer.' + #13#10 + #13#10 +
    'Requirements:' + #13#10 +
    '  • Docker Desktop for Windows' + #13#10 +
    '  • Windows 10/11 (64-bit)' + #13#10 +
    '  • 8GB RAM minimum (16GB recommended)' + #13#10 +
    '  • 20GB free disk space' + #13#10 + #13#10 +
    'The installer will check for Docker Desktop and guide you through the setup process.');

  { Admin Email Page }
  AdminEmailPage := CreateInputQueryPage(wpSelectDir,
    'Administrator Account Setup',
    'Enter administrator email and password',
    'Please provide an email address and password for the administrator account.' + #13#10 +
    'This will be used to log into DataForeman.');
  
  AdminEmailPage.Add('Email address:', False);
  AdminEmailPage.Values[0] := 'admin@example.com';

  { Admin Password Page }
  AdminPasswordPage := CreateInputQueryPage(AdminEmailPage.ID,
    'Administrator Password',
    'Set a secure password for the administrator account',
    'Choose a strong password (minimum 8 characters recommended).');
  
  AdminPasswordPage.Add('Password:', True);
  AdminPasswordPage.Add('Confirm password:', True);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  
  { Validate Admin Email Page }
  if CurPageID = AdminEmailPage.ID then
  begin
    if Trim(AdminEmailPage.Values[0]) = '' then
    begin
      MsgBox('Please enter an email address.', mbError, MB_OK);
      Result := False;
    end
    else if Pos('@', AdminEmailPage.Values[0]) = 0 then
    begin
      MsgBox('Please enter a valid email address.', mbError, MB_OK);
      Result := False;
    end;
  end;

  { Validate Admin Password Page }
  if CurPageID = AdminPasswordPage.ID then
  begin
    if Trim(AdminPasswordPage.Values[0]) = '' then
    begin
      MsgBox('Please enter a password.', mbError, MB_OK);
      Result := False;
    end
    else if Length(AdminPasswordPage.Values[0]) < 6 then
    begin
      MsgBox('Password must be at least 6 characters long.', mbError, MB_OK);
      Result := False;
    end
    else if AdminPasswordPage.Values[0] <> AdminPasswordPage.Values[1] then
    begin
      MsgBox('Passwords do not match. Please try again.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvFile: TStringList;
  EnvPath: String;
  I: Integer;
  Line: String;
  AdminEmail: String;
  AdminPassword: String;
  LogDirs: array[0..7] of String;
  DirIndex: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    // Create log directories with proper admin permissions
    LogDirs[0] := ExpandConstant('{app}\logs');
    LogDirs[1] := ExpandConstant('{app}\logs\core');
    LogDirs[2] := ExpandConstant('{app}\logs\connectivity');
    LogDirs[3] := ExpandConstant('{app}\logs\front');
    LogDirs[4] := ExpandConstant('{app}\logs\nats');
    LogDirs[5] := ExpandConstant('{app}\logs\postgres');
    LogDirs[6] := ExpandConstant('{app}\logs\ops');
    LogDirs[7] := ExpandConstant('{app}\var');
  
    for DirIndex := 0 to 7 do
    begin
      if not DirExists(LogDirs[DirIndex]) then
      begin
        CreateDir(LogDirs[DirIndex]);
      end;
    end;
    EnvPath := ExpandConstant('{app}\.env');
    
    // Create .env file if it doesn't exist
    if not FileExists(EnvPath) then
    begin
      if FileExists(ExpandConstant('{app}\.env.example')) then
      begin
        FileCopy(ExpandConstant('{app}\.env.example'), EnvPath, False);
      end;
    end;

    // Update .env file with admin credentials
    if FileExists(EnvPath) then
    begin
      AdminEmail := AdminEmailPage.Values[0];
      AdminPassword := AdminPasswordPage.Values[0];
      
      EnvFile := TStringList.Create;
      try
        EnvFile.LoadFromFile(EnvPath);
        
        // Update or add ADMIN_EMAIL and ADMIN_PASSWORD
        for I := 0 to EnvFile.Count - 1 do
        begin
          Line := EnvFile[I];
          
          // Update ADMIN_PASSWORD
          if Pos('ADMIN_PASSWORD=', Line) = 1 then
          begin
            EnvFile[I] := 'ADMIN_PASSWORD=' + AdminPassword;
          end;
          
          // Add/Update ADMIN_EMAIL (if line exists)
          if Pos('ADMIN_EMAIL=', Line) = 1 then
          begin
            EnvFile[I] := 'ADMIN_EMAIL=' + AdminEmail;
          end;
        end;
        
        // If ADMIN_EMAIL doesn't exist in file, add it after ADMIN_PASSWORD
        if Pos('ADMIN_EMAIL=', EnvFile.Text) = 0 then
        begin
          for I := 0 to EnvFile.Count - 1 do
          begin
            if Pos('ADMIN_PASSWORD=', EnvFile[I]) = 1 then
            begin
              EnvFile.Insert(I + 1, 'ADMIN_EMAIL=' + AdminEmail);
              Break;
            end;
          end;
        end;
        
        EnvFile.SaveToFile(EnvPath);
      finally
        EnvFile.Free;
      end;
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    // The uninstall.ps1 script will handle data volume cleanup
    // and ask the user what they want to do
  end;
end;
