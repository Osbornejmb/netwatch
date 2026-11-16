using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Drawing;
using System.IO;
using System.Security.Principal;
using System.Threading;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public class DesktopSettings {
 public string node {get;set;} public string root {get;set;} public string database {get;set;} public bool icmp {get;set;} public bool discovery {get;set;} public bool discoveryIcmp {get;set;} public bool lan {get;set;}
}
public class AuditRow {public long at {get;set;} public string ip {get;set;} public string action {get;set;} public string detail {get;set;}}
public class RemoteSession {public string role {get;set;} public string ip {get;set;} public long lastSeen {get;set;}}
public class HostEvent {public string type {get;set;} public string error {get;set;} public string viewerMode {get;set;} public bool adminConfigured {get;set;} public bool viewerConfigured {get;set;} public bool operatorConfigured {get;set;} public string[] urls {get;set;} public RemoteSession[] sessions {get;set;} public AuditRow[] audit {get;set;}public string state {get;set;} public string message {get;set;} public int port {get;set;} public string dashboardUrl {get;set;}}
public class NetWatchMenuColors : ProfessionalColorTable {
 public override Color ToolStripDropDownBackground {get{return Color.FromArgb(252,251,247);}}
 public override Color ImageMarginGradientBegin {get{return ToolStripDropDownBackground;}}
 public override Color ImageMarginGradientMiddle {get{return ToolStripDropDownBackground;}}
 public override Color ImageMarginGradientEnd {get{return ToolStripDropDownBackground;}}
 public override Color MenuItemSelected {get{return Color.FromArgb(229,238,230);}}
 public override Color MenuItemSelectedGradientBegin {get{return MenuItemSelected;}}
 public override Color MenuItemSelectedGradientEnd {get{return MenuItemSelected;}}
 public override Color MenuItemBorder {get{return Color.FromArgb(23,102,84);}}
 public override Color MenuBorder {get{return Color.FromArgb(216,221,211);}}
}
public class NetWatch : Form {
#if PACKAGED
 readonly string settingsPath=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"NetWatch","desktop.json");
#else
 readonly string settingsPath=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"desktop.json");
#endif
 readonly string nodePath,appRoot;
 readonly JavaScriptSerializer json=new JavaScriptSerializer();
 DesktopSettings settings;
 Process host;
 NotifyIcon tray;
 Label status;
 CheckBox monitoring,discovery,discoveryIcmp,lan;
 AccessWindow accessWindow;
 HostEvent accessInfo;
 Button start,stop,open;
 ToolStripMenuItem trayStart,trayStop,trayOpen;
 string dashboardUrl="http://127.0.0.1:4317";
 bool quitting=false;
 string state="stopped";

 [STAThread] public static void Main() {
  bool first;
  using(var showRequest=new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\NetWatch.Show."+WindowsIdentity.GetCurrent().User.Value))
  using(var single=new Mutex(true,"Local\\NetWatch.Desktop."+WindowsIdentity.GetCurrent().User.Value,out first)) {
   if(!first){showRequest.Set();return;}
#if PACKAGED
   using(var installed=new Mutex(false,"Local\\NetWatch.InstalledDesktop")) {
#endif
   Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
   try {Application.Run(new NetWatch(showRequest));}
   catch(Exception e){MessageBox.Show(e.Message,"NetWatch startup",MessageBoxButtons.OK,MessageBoxIcon.Error);}
#if PACKAGED
   }
#endif
  }
 }
 public NetWatch(EventWaitHandle showRequest) {
#if PACKAGED
  Directory.CreateDirectory(Path.GetDirectoryName(settingsPath));
  settings=File.Exists(settingsPath)?json.Deserialize<DesktopSettings>(File.ReadAllText(settingsPath)):new DesktopSettings{database=Path.Combine(Path.GetDirectoryName(settingsPath),"data","netwatch.sqlite")};
  appRoot=AppDomain.CurrentDomain.BaseDirectory;
  nodePath=Path.Combine(appRoot,"node.exe");
#else
  settings=json.Deserialize<DesktopSettings>(File.ReadAllText(settingsPath));
  nodePath=settings==null?null:settings.node;appRoot=settings==null?null:settings.root;
#endif
  if(settings==null||!Path.IsPathRooted(settings.database)||!File.Exists(nodePath)||String.IsNullOrEmpty(appRoot)||!File.Exists(Path.Combine(appRoot,"host","desktop.js")))throw new Exception("NetWatch files or settings are unavailable. Check the data path and reinstall NetWatch.");
  Text="NetWatch";ClientSize=new Size(540,444);Font=new Font(SystemFonts.MessageBoxFont.FontFamily,10);BackColor=Color.FromArgb(244,243,238);ForeColor=Color.FromArgb(37,58,54);
  FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;Icon=SystemIcons.Application;
  var title=new Label{Text="Your network, at a glance",Font=new Font(Font,FontStyle.Bold),Location=new Point(20,18),AutoSize=true};Controls.Add(title);
  status=new Label{Text="Stopped",Location=new Point(20,55),Size=new Size(500,65),AccessibleName="Host status"};Controls.Add(status);
  start=new Button{Text="&Start",Location=new Point(20,125),Size=new Size(110,40)};start.Click+=(s,e)=>StartHost();Controls.Add(start);
  stop=new Button{Text="S&top",Location=new Point(140,125),Size=new Size(110,40),Enabled=false};stop.Click+=(s,e)=>StopHost();Controls.Add(stop);
  open=new Button{Text="&Open dashboard",Location=new Point(260,125),Size=new Size(160,40),Enabled=false};open.Click+=(s,e)=>OpenDashboard();Controls.Add(open);
  var quit=new Button{Text="&Quit",Location=new Point(430,125),Size=new Size(90,40)};quit.Click+=(s,e)=>Quit();Controls.Add(quit);
  monitoring=new CheckBox{Text="Check devices on next start",Checked=settings.icmp,Location=new Point(20,180),AutoSize=true};
  monitoring.CheckedChanged+=(s,e)=>{try{settings.icmp=monitoring.Checked;File.WriteAllText(settingsPath,json.Serialize(settings));}catch(Exception ex){MessageBox.Show(ex.Message,"Unable to save settings");}};Controls.Add(monitoring);
  discovery=new CheckBox{Text="Discover local network neighbors on next start",Checked=settings.discovery,Location=new Point(20,205),AutoSize=true};
  discovery.CheckedChanged+=(s,e)=>{try{settings.discovery=discovery.Checked;File.WriteAllText(settingsPath,json.Serialize(settings));}catch(Exception ex){MessageBox.Show(ex.Message,"Unable to save settings");}};Controls.Add(discovery);
  discoveryIcmp=new CheckBox{Text="Also check local devices with ICMP (slower)",Checked=settings.discoveryIcmp,Location=new Point(20,230),AutoSize=true,Enabled=settings.discovery};
  discoveryIcmp.CheckedChanged+=(s,e)=>{try{settings.discoveryIcmp=discoveryIcmp.Checked;File.WriteAllText(settingsPath,json.Serialize(settings));}catch(Exception ex){MessageBox.Show(ex.Message,"Unable to save settings");}};Controls.Add(discoveryIcmp);
  discovery.CheckedChanged+=(s,e)=>{discoveryIcmp.Enabled=discovery.Checked;if(!discovery.Checked){settings.discoveryIcmp=false;discoveryIcmp.Checked=false;}};
  lan=new CheckBox{Text="Allow other PCs on this network",Checked=settings.lan,Location=new Point(20,255),AutoSize=true};
  lan.CheckedChanged+=(s,e)=>{try{settings.lan=lan.Checked;File.WriteAllText(settingsPath,json.Serialize(settings));SendAccess("lan-preference",settings.lan?"enabled":"disabled",null,null);}catch(Exception ex){MessageBox.Show(ex.Message,"Unable to save settings");}};Controls.Add(lan);
  var access=new Button{Text="Remote access…",Location=new Point(350,251),Size=new Size(170,38)};
  access.Click+=(s,e)=>ShowAccess();Controls.Add(access);
  var data=new TextBox{Text="Saved data: "+settings.database,ReadOnly=true,Multiline=true,BorderStyle=BorderStyle.None,BackColor=BackColor,ForeColor=ForeColor,Location=new Point(20,302),Size=new Size(500,40),AccessibleName="Saved data location"};Controls.Add(data);
  Controls.Add(new Label{Text="Discovery lists nearby devices for review; it never enables monitoring.\nICMP discovery is separately optional. Saved devices need their own approval.\nStop or Quit pauses the host; sign-out also stops it.",Location=new Point(20,350),Size=new Size(500,70)});
  foreach(Control control in Controls){var button=control as Button;if(button!=null){button.FlatStyle=FlatStyle.Flat;button.BackColor=Color.FromArgb(252,251,247);button.ForeColor=ForeColor;button.FlatAppearance.BorderColor=Color.FromArgb(170,183,172);button.UseVisualStyleBackColor=false;}}
  var menu=new ContextMenuStrip{BackColor=Color.FromArgb(252,251,247),ForeColor=ForeColor,Renderer=new ToolStripProfessionalRenderer(new NetWatchMenuColors())};menu.Items.Add("Show controls",null,(s,e)=>ShowControls());
  trayStart=new ToolStripMenuItem("Start",null,(s,e)=>StartHost());menu.Items.Add(trayStart);
  trayStop=new ToolStripMenuItem("Stop",null,(s,e)=>StopHost()){Enabled=false};menu.Items.Add(trayStop);
  trayOpen=new ToolStripMenuItem("Open dashboard",null,(s,e)=>OpenDashboard()){Enabled=false};menu.Items.Add(trayOpen);
  menu.Items.Add(new ToolStripSeparator());menu.Items.Add("Quit NetWatch",null,(s,e)=>Quit());
  tray=new NotifyIcon{Icon=Icon,Text="NetWatch: stopped",ContextMenuStrip=menu,Visible=true};tray.DoubleClick+=(s,e)=>ShowControls();
  FormClosing+=(s,e)=>{if(e.CloseReason==CloseReason.UserClosing&&!quitting){e.Cancel=true;Hide();}};
  FormClosed+=(s,e)=>{tray.Visible=false;tray.Dispose();};
  var showTimer=new System.Windows.Forms.Timer{Interval=250};showTimer.Tick+=(s,e)=>{if(showRequest.WaitOne(0))ShowControls();};showTimer.Start();FormClosed+=(s,e)=>showTimer.Dispose();
 }
 void ShowControls(){Show();WindowState=FormWindowState.Normal;Activate();}
 void UI(Action action){if(!IsDisposed&&IsHandleCreated)BeginInvoke(action);}
 void SetState(string next,string message) {
  state=next;
  if(next=="running") {
   message=settings.icmp?"NetWatch is running. Device checks are on.":"NetWatch is running. Device checks are paused.";
   if(settings.lan&&accessInfo!=null&&!accessInfo.adminConfigured)message+="\nSet an admin password under Remote access.";
  }
  else if(next=="error")message=message!=null&&message.Contains("HTTPS")?"Check the HTTPS certificate and key. See Direct HTTPS in the Remote access guide.":"NetWatch could not continue. Check that another copy is not already running and that your saved data is available.";
  status.Text=message;status.AccessibleName="NetWatch status: "+message;tray.Text="NetWatch: "+next;
  bool idle=host==null;
  start.Enabled=trayStart.Enabled=idle&&!quitting;stop.Enabled=trayStop.Enabled=!idle&&next!="stopping";
  open.Enabled=trayOpen.Enabled=next=="running";monitoring.Enabled=discovery.Enabled=lan.Enabled=idle;discoveryIcmp.Enabled=idle&&settings.discovery;
 }
 void StartHost() {
  if(host!=null)return;
  try {
   var info=new ProcessStartInfo(nodePath,"host/desktop.js"){WorkingDirectory=appRoot,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};
   info.EnvironmentVariables["NETWATCH_DB"]=settings.database;info.EnvironmentVariables["NETWATCH_ICMP"]=settings.icmp?"1":"0";info.EnvironmentVariables["NETWATCH_DISCOVERY"]=settings.discovery?"1":"0";info.EnvironmentVariables["NETWATCH_DISCOVERY_ICMP"]=settings.discovery&&settings.discoveryIcmp?"1":"0";
   info.EnvironmentVariables["NETWATCH_LAN"]=settings.lan?"1":"0";
   accessInfo=null;
   host=new Process{StartInfo=info,EnableRaisingEvents=true};
   host.OutputDataReceived+=(s,e)=>{if(e.Data==null)return;try{var item=json.Deserialize<HostEvent>(e.Data);UI(()=>{if(item.type=="access"){ApplyAccess(item);return;}if(!String.IsNullOrEmpty(item.dashboardUrl))dashboardUrl=item.dashboardUrl;SetState(item.state,item.message);});}catch{}};
   host.ErrorDataReceived+=(s,e)=>{if(!String.IsNullOrWhiteSpace(e.Data))UI(()=>SetState("error","Launcher error. Check Node and the data path."));};
   host.Exited+=(s,e)=>{var ended=(Process)s;ended.WaitForExit();UI(()=>{if(host!=ended)return;ended.Dispose();host=null;accessInfo=null;if(accessWindow!=null)accessWindow.Apply(null);if(quitting)Application.Exit();else SetState(state=="error"?"error":"stopped",state=="error"?status.Text:"NetWatch is stopped. Your data is saved.");});};
   host.Start();host.BeginOutputReadLine();host.BeginErrorReadLine();SetState("starting","Starting NetWatch…");
  } catch(Exception ex){if(host!=null){host.Dispose();host=null;}SetState("error",ex.Message);}
 }
 void ShowAccess() {
  using(var window=new AccessWindow(SendAccess)) {
   accessWindow=window;
   window.Apply(accessInfo);
   window.Shown+=(s,e)=>SendAccess("status",null,null,null);
   window.ShowDialog(this);
   accessWindow=null;
  }
 }
 void ApplyAccess(HostEvent item) {
  if(item.error==null)accessInfo=item;
  if(accessWindow!=null)accessWindow.Apply(item);
  if(state=="running")SetState(state,status.Text);
 }
 void SendAccess(string command,string mode,string password,string confirm) {
  var request=new Dictionary<string,string>{{"command",command}};
  if(mode!=null)request["mode"]=mode;
  if(password!=null){request["password"]=password;request["confirm"]=confirm;}
  string message=Regex.Replace(json.Serialize(request),@"[^\x00-\x7F]",m=>"\\u"+((int)m.Value[0]).ToString("x4"));
  try {
   if(host!=null) {
    if(state!="running")throw new InvalidOperationException();
    host.StandardInput.WriteLine(message);host.StandardInput.Flush();
   } else {
    var info=new ProcessStartInfo(nodePath,"host/auth-config.js --launcher"){WorkingDirectory=appRoot,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,StandardOutputEncoding=Encoding.UTF8};
    info.EnvironmentVariables["NETWATCH_DB"]=settings.database;
    using(var process=Process.Start(info)) {
     process.StandardInput.WriteLine(message);process.StandardInput.Close();
     var output=process.StandardOutput.ReadToEndAsync();
     if(!process.WaitForExit(6000)){process.Kill();throw new InvalidOperationException();}
     if(process.ExitCode!=0)throw new InvalidOperationException();
     ApplyAccess(json.Deserialize<HostEvent>(output.Result));
    }
   }
  } catch {ApplyAccess(new HostEvent{error="Unable to update access settings. Check passwords and try again."});}
 }
 void StopHost(){if(host==null)return;try{host.StandardInput.WriteLine("stop");host.StandardInput.Flush();SetState("stopping","Finishing checks and saving your data…");}catch(Exception ex){SetState("error",ex.Message);}}
 void OpenDashboard(){try{Process.Start(new ProcessStartInfo(dashboardUrl){UseShellExecute=true});}catch(Exception ex){MessageBox.Show(ex.Message,"Unable to open browser");}}
 void Quit(){quitting=true;if(host==null)Application.Exit();else StopHost();}
}

public class AccessWindow : Form {
 readonly Action<string,string,string,string> send;
 readonly ComboBox mode,urls;
 readonly ListView sessions,audit;
 readonly Label status,networkNote;
 readonly Button revoke,copy,disableOperator;
 bool updating;
 public AccessWindow(Action<string,string,string,string> send) {
  this.send=send;
  Text="Remote access";ClientSize=new Size(570,555);FormBorderStyle=FormBorderStyle.FixedDialog;
  StartPosition=FormStartPosition.CenterParent;MaximizeBox=false;MinimizeBox=false;
  BackColor=Color.FromArgb(244,243,238);ForeColor=Color.FromArgb(37,58,54);
  status=new Label{Location=new Point(16,14),Size=new Size(538,44),Text="Reading access settings…"};Controls.Add(status);
  var admin=AddButton("Set admin password…",16,63,170);admin.Click+=(s,e)=>Password("admin");
  var viewer=AddButton("Set viewer password…",198,63,175);viewer.Click+=(s,e)=>Password("viewer");
  var changeOperator=AddButton("Set operator password…",385,63,169);changeOperator.Click+=(s,e)=>Password("operator");
  Controls.Add(new Label{Text="Viewers",Location=new Point(16,113),AutoSize=true});
  mode=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Location=new Point(85,108),Size=new Size(215,30),AccessibleName="Viewers"};
  mode.Items.AddRange(new object[]{"Open (no password)","Password","Disabled"});Controls.Add(mode);
  disableOperator=AddButton("Disable operator access",320,105,234);disableOperator.Enabled=false;
  disableOperator.Click+=(s,e)=>send("disable-operator",null,null,null);
  mode.SelectedIndexChanged+=(s,e)=>{if(!updating&&mode.SelectedIndex>=0)send("viewer-mode",new[]{"open","password","disabled"}[mode.SelectedIndex],null,null);};
  urls=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Location=new Point(16,148),Size=new Size(430,30),AccessibleName="Reachable URLs"};Controls.Add(urls);
  copy=AddButton("Copy URL",458,145,96);
  copy.Click+=(s,e)=>{if(urls.SelectedItem!=null)Clipboard.SetText((string)urls.SelectedItem);};
  networkNote=new Label{Location=new Point(16,184),Size=new Size(538,46)};Controls.Add(networkNote);
  sessions=new ListView{View=View.Details,Location=new Point(16,235),Size=new Size(538,106),FullRowSelect=true,AccessibleName="Active remote sessions"};
  sessions.Columns.Add("Role",105);sessions.Columns.Add("IP address",175);sessions.Columns.Add("Last seen",220);Controls.Add(sessions);
  revoke=AddButton("Sign out all remote sessions",16,354,230);
  revoke.Click+=(s,e)=>send("revoke-sessions",null,null,null);
  Controls.Add(new Label{Text="Access log",Location=new Point(16,396),AutoSize=true});
  audit=new ListView{View=View.Details,Location=new Point(16,418),Size=new Size(538,125),FullRowSelect=true,AccessibleName="Access log"};
  audit.Columns.Add("Last activity",150);audit.Columns.Add("Action",190);audit.Columns.Add("Details",170);Controls.Add(audit);
  var close=AddButton("Close",458,354,96);close.DialogResult=DialogResult.Cancel;CancelButton=close;
 }
 Button AddButton(string text,int x,int y,int width) {
  var button=new Button{Text=text,Location=new Point(x,y),Size=new Size(width,36),BackColor=Color.FromArgb(252,251,247),FlatStyle=FlatStyle.Flat};
  Controls.Add(button);return button;
 }
 public void Apply(HostEvent item) {
  if(item!=null&&item.error!=null){status.Text=item.error;return;}
  status.Text=item==null?"Reading access settings…":!item.adminConfigured?"Set an admin password to allow remote access.":item.viewerMode=="password"&&!item.viewerConfigured?"Set a viewer password to allow viewer sign-in.":"Admin password is set.";
  disableOperator.Enabled=item!=null&&item.operatorConfigured;
  updating=true;
  mode.SelectedIndex=item==null?-1:Array.IndexOf(new[]{"open","password","disabled"},item.viewerMode);
  updating=false;
  string selection=urls.SelectedItem as string;
  urls.Items.Clear();
  if(item!=null&&item.urls!=null)urls.Items.AddRange(item.urls);
  if(urls.Items.Count>0)urls.SelectedIndex=Math.Max(0,urls.Items.IndexOf(selection??""));
  copy.Enabled=urls.Items.Count>0;
  networkNote.Text=(urls.Items.Count>0&&((string)urls.Items[0]).StartsWith("https://")?"HTTPS on your private network. ":"Plain HTTP on your private network. Use a unique password. ")+"Allow Windows Firewall access on Private networks only and consider a DHCP reservation.";
  sessions.Items.Clear();
  if(item!=null&&item.sessions!=null)foreach(var row in item.sessions) {
   var at=new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc).AddMilliseconds(row.lastSeen).ToLocalTime();
   sessions.Items.Add(new ListViewItem(new[]{row.role,row.ip,at.ToString("g")}));
  }
  revoke.Enabled=item!=null&&item.adminConfigured;
  audit.Items.Clear();
  if(item!=null&&item.audit!=null)foreach(var row in item.audit) {
   var at=new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc).AddMilliseconds(row.at).ToLocalTime();
   audit.Items.Add(new ListViewItem(new[]{at.ToString("g"),row.action.Replace('_',' '),row.detail??row.ip??""}));
  }
 }
 void Password(string role) {
  using(var dialog=new Form{Text="Set "+role+" password",ClientSize=new Size(390,220),StartPosition=FormStartPosition.CenterParent,FormBorderStyle=FormBorderStyle.FixedDialog,MinimizeBox=false,MaximizeBox=false,BackColor=BackColor,ForeColor=ForeColor}) {
   var first=new TextBox{UseSystemPasswordChar=true,MaxLength=128,Location=new Point(16,37),Width=358,AccessibleName="New password"};
   var second=new TextBox{UseSystemPasswordChar=true,MaxLength=128,Location=new Point(16,90),Width=358,AccessibleName="Confirm password"};
   var help=new Label{Text="Use at least 12 characters.",Location=new Point(16,122),Size=new Size(358,36)};
   var save=new Button{Text="Save",Location=new Point(184,166),Size=new Size(90,36)};
   var cancel=new Button{Text="Cancel",Location=new Point(284,166),Size=new Size(90,36),DialogResult=DialogResult.Cancel};
   dialog.Controls.AddRange(new Control[]{new Label{Text="New password",Location=new Point(16,15),AutoSize=true},first,new Label{Text="Confirm password",Location=new Point(16,69),AutoSize=true},second,help,save,cancel});
   dialog.AcceptButton=save;dialog.CancelButton=cancel;
   save.Click+=(s,e)=>{
    if(first.Text.Length<12||first.Text!=second.Text){help.Text="Enter at least 12 characters and make both entries match.";return;}
    send("set-"+role+"-password",null,first.Text,second.Text);dialog.Close();
   };
   dialog.ShowDialog(this);
  }
 }
}
