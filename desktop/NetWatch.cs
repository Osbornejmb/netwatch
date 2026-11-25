using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public class DesktopSettings {
 public bool infrastructureOnly {get;set;}
 public string node {get;set;} public string root {get;set;} public string database {get;set;} public bool icmp {get;set;} public bool discovery {get;set;} public bool discoveryIcmp {get;set;} public bool lan {get;set;}
 public bool managedSharing {get;set;} public bool? snmp {get;set;}
 public Dictionary<string,string> snmpPortContexts {get;set;}
}
public class AuditRow {public long at {get;set;} public string ip {get;set;} public string action {get;set;} public string detail {get;set;}}
public class RemoteSession {public string role {get;set;} public string ip {get;set;} public long lastSeen {get;set;}}
public class HostEvent {public string type {get;set;} public string error {get;set;} public string viewerMode {get;set;} public bool adminConfigured {get;set;} public bool viewerConfigured {get;set;} public string[] urls {get;set;} public RemoteSession[] sessions {get;set;} public AuditRow[] audit {get;set;}public string state {get;set;} public string message {get;set;} public int port {get;set;} public string dashboardUrl {get;set;}}
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
public static class NetWatchDialogStyle {
 static readonly Color Canvas=Color.FromArgb(244,243,238);
 static readonly Color Paper=Color.FromArgb(252,251,247);
 static readonly Color Ink=Color.FromArgb(37,58,54);
 static readonly Color Edge=Color.FromArgb(170,183,172);
 public static void Prepare(Form form) {
  form.AutoScaleDimensions=new SizeF(96F,96F);
  form.AutoScaleMode=AutoScaleMode.Dpi;
  form.BackColor=SystemInformation.HighContrast?SystemColors.Control:Canvas;
  form.ForeColor=SystemInformation.HighContrast?SystemColors.ControlText:Ink;
 }
 public static void Apply(Control parent) {
  bool highContrast=SystemInformation.HighContrast;
  foreach(Control control in parent.Controls) {
   if(control is TextBox||control is ComboBox||control is ListView){control.BackColor=highContrast?SystemColors.Window:Paper;control.ForeColor=highContrast?SystemColors.WindowText:Ink;}
   if(control is RadioButton)control.BackColor=highContrast?SystemColors.Control:Canvas;
   if(control is Button) {
    var button=(Button)control;
    button.BackColor=highContrast?SystemColors.Control:Paper;
    button.ForeColor=highContrast?SystemColors.ControlText:Ink;
    button.UseVisualStyleBackColor=highContrast;
    button.FlatStyle=highContrast?FlatStyle.Standard:FlatStyle.Flat;
    if(!highContrast) {
     button.FlatAppearance.BorderColor=Edge;
     button.FlatAppearance.MouseOverBackColor=Color.FromArgb(231,239,230);
     button.FlatAppearance.MouseDownBackColor=Color.FromArgb(218,233,221);
    }
   }
   Apply(control);
  }
 }
}
public class NetWatch : Form {
 static readonly Color Ink=Color.FromArgb(37,58,54);
 static readonly Color Canvas=Color.FromArgb(244,243,238);
 static readonly Color Paper=Color.FromArgb(252,251,247);
 static readonly Color Green=Color.FromArgb(23,102,84);
 static readonly Color Edge=Color.FromArgb(170,183,172);
 sealed class LauncherCheckBox : CheckBox {
  public LauncherCheckBox() {
   SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.Opaque|
    ControlStyles.OptimizedDoubleBuffer|ControlStyles.ResizeRedraw,true);
   SetStyle(ControlStyles.SupportsTransparentBackColor,false);
   BackColor=Canvas;
   CheckedChanged+=(s,e)=>Invalidate();
  }
  protected override void OnPaint(PaintEventArgs e) {
   using(var background=new SolidBrush(BackColor))e.Graphics.FillRectangle(background,e.ClipRectangle);
   var box=new Rectangle(1,(Height-16)/2,16,16);
   var ink=Enabled?Ink:Color.FromArgb(105,118,108);
   var fill=Checked?(Enabled?Green:Color.FromArgb(105,118,108)):Paper;
   if(SystemInformation.HighContrast) {
    ink=Enabled?SystemColors.WindowText:SystemColors.GrayText;
    fill=Checked?SystemColors.Highlight:SystemColors.Window;
   }
   using(var brush=new SolidBrush(fill))e.Graphics.FillRectangle(brush,box);
   using(var pen=new Pen(Checked?fill:ink))e.Graphics.DrawRectangle(pen,box);
   if(Checked) {
    e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
    using(var pen=new Pen(SystemInformation.HighContrast?SystemColors.HighlightText:Paper,2))
     e.Graphics.DrawLines(pen,new[]{new Point(box.Left+4,box.Top+8),new Point(box.Left+7,box.Top+11),new Point(box.Left+13,box.Top+5)});
   }
   var label=new Rectangle(25,0,Width-25,Height);
   TextRenderer.DrawText(e.Graphics,Text,Font,label,ink,TextFormatFlags.VerticalCenter|
    TextFormatFlags.SingleLine|TextFormatFlags.EndEllipsis|TextFormatFlags.PreserveGraphicsClipping|
    TextFormatFlags.PreserveGraphicsTranslateTransform);
   if(Focused&&ShowFocusCues)ControlPaint.DrawFocusRectangle(e.Graphics,ClientRectangle,ink,BackColor);
  }
 }
#if PACKAGED
 static readonly string settingsPath=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"NetWatch","desktop.json");
#else
 static readonly string settingsPath=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"desktop.json");
#endif
 static readonly string sharingPath=Path.Combine(Path.GetDirectoryName(settingsPath),"sharing");
 readonly string nodePath,appRoot;
 readonly JavaScriptSerializer json=new JavaScriptSerializer();
 DesktopSettings settings;
 Process host;
 NotifyIcon tray;
 Label status,statusTitle,settingsNote;
 CheckBox monitoring,infrastructureOnly,discovery,discoveryIcmp,lan,portChecks;
 AccessWindow accessWindow;
 HostEvent accessInfo;
 Button lifecycle,open,settingsToggle;
 Panel settingsPanel;
 Panel settingsViewport;
 Panel statusCard;
 ToolStripMenuItem trayStart,trayStop,trayOpen;
 string dashboardUrl="http://127.0.0.1:4317";
 bool quitting=false,settingUpPorts=false,restoringPortPreference=false;
 string state="stopped";
 bool tlsError,localOnly;

 [STAThread] public static void Main(string[] args) {
  bool first;
  using(var showRequest=new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\NetWatch.Show."+WindowsIdentity.GetCurrent().User.Value))
  using(var single=new Mutex(true,"Local\\NetWatch.Desktop."+WindowsIdentity.GetCurrent().User.Value,out first)) {
   if(!first){
#if PACKAGED
    if(args.Length==1&&args[0]=="--setup-sharing") {
     MessageBox.Show("Quit the other copy of NetWatch, then open NetWatch again and choose Remote access → Set up or repair sharing.","Sharing setup",MessageBoxButtons.OK,MessageBoxIcon.Information);
     return;
    }
#endif
    showRequest.Set();return;
   }
#if PACKAGED
   using(var installed=new Mutex(false,"Local\\NetWatch.InstalledDesktop")) {
#endif
   Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
   try {
#if PACKAGED
    if(args.Length==1&&args[0]=="--setup-sharing") {
     string root=AppDomain.CurrentDomain.BaseDirectory;
     ConfigureSharing(null,LoadInstalledSettings(),root,Path.Combine(root,"node.exe"));
     return;
    }
#endif
    Application.Run(new NetWatch(showRequest));
   }
   catch(Exception e){MessageBox.Show(e.Message,"NetWatch startup",MessageBoxButtons.OK,MessageBoxIcon.Error);}
#if PACKAGED
   }
#endif
  }
 }
 public NetWatch(EventWaitHandle showRequest) {
#if PACKAGED
  settings=LoadInstalledSettings();
  appRoot=AppDomain.CurrentDomain.BaseDirectory;
  nodePath=Path.Combine(appRoot,"node.exe");
#else
  settings=json.Deserialize<DesktopSettings>(File.ReadAllText(settingsPath));
  nodePath=settings==null?null:settings.node;appRoot=settings==null?null:settings.root;
#endif
  if(settings==null||!Path.IsPathRooted(settings.database)||!File.Exists(nodePath)||String.IsNullOrEmpty(appRoot)||!File.Exists(Path.Combine(appRoot,"host","desktop.js")))throw new Exception("NetWatch files or settings are unavailable. Check the data path and reinstall NetWatch.");
  Text="NetWatch";ClientSize=new Size(520,284);Font=new Font("Segoe UI",10);BackColor=Canvas;ForeColor=Ink;
  FormBorderStyle=FormBorderStyle.None;StartPosition=FormStartPosition.CenterScreen;
  Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath)??SystemIcons.Application;
  var header=new Panel{Location=new Point(1,1),Size=new Size(518,54),BackColor=Ink,ForeColor=Paper};
  var brandImage=new PictureBox{Location=new Point(18,11),Size=new Size(32,32)};
  using(var brandIcon=new Icon(Icon,32,32))brandImage.Image=brandIcon.ToBitmap();
  var brandName=new Label{Text="NetWatch",Font=new Font(Font.FontFamily,14,FontStyle.Bold),Location=new Point(60,13),AutoSize=true};
  var hide=new Button{Text="&Hide to tray",Location=new Point(396,7),Size=new Size(110,40),TabIndex=0};
  StyleButton(hide,true);
  hide.Click+=(s,e)=>Hide();
  EnableWindowDrag(header,brandImage,brandName);
  header.Controls.AddRange(new Control[]{brandImage,brandName,hide});
  Controls.Add(header);
  statusCard=new Panel{Location=new Point(20,70),Size=new Size(480,96),BackColor=Paper};
  statusTitle=new Label{Font=new Font(Font.FontFamily,17,FontStyle.Bold),Location=new Point(16,9),AutoSize=true};
  status=new Label{Location=new Point(17,44),Size=new Size(446,50),AccessibleName="Host status"};
  statusCard.Controls.AddRange(new Control[]{statusTitle,status});
  Controls.Add(statusCard);
  lifecycle=new Button{Location=new Point(20,176),Size=new Size(140,42)};
  lifecycle.Click+=(s,e)=>{if(host==null)StartHost();else StopHost();};
  open=new Button{Text="&Open dashboard",Location=new Point(170,176),Size=new Size(174,42),Enabled=false};
  open.Click+=(s,e)=>{if(tlsError&&host==null)StartHost(true);else OpenDashboard();};
  settingsToggle=new Button{Text="S&ettings…",Location=new Point(20,228),Size=new Size(140,40)};
  settingsToggle.Click+=(s,e)=>ToggleSettings();
  var quit=new Button{Text="&Quit",Location=new Point(406,228),Size=new Size(94,40)};
  quit.Click+=(s,e)=>Quit();
  Controls.AddRange(new Control[]{lifecycle,open,settingsToggle,quit});
  settingsViewport=new Panel{Location=new Point(20,282),Size=new Size(499,342),AutoScroll=true,Visible=false};
  settingsPanel=new Panel{Location=Point.Empty,Size=new Size(480,342),BackColor=Canvas};
  settingsNote=new Label{Location=new Point(0,1),Size=new Size(480,24)};
  settingsPanel.Controls.Add(settingsNote);
  settingsPanel.Controls.Add(SettingsHeading("Monitoring",29));
  monitoring=new LauncherCheckBox{Text="Check whether approved devices are online",Checked=settings.icmp,Location=new Point(0,54),Size=new Size(440,24)};
  monitoring.CheckedChanged+=(s,e)=>{try{settings.icmp=monitoring.Checked;File.WriteAllText(settingsPath,json.Serialize(settings));}catch(Exception ex){MessageBox.Show(ex.Message,"Unable to save settings");}};
  settingsPanel.Controls.Add(monitoring);
  discovery=new LauncherCheckBox{Text="Find nearby devices",Checked=settings.discovery,Location=new Point(0,164),Size=new Size(440,24)};
  discovery.CheckedChanged+=(s,e)=>{try{settings.discovery=discovery.Checked;File.WriteAllText(settingsPath,json.Serialize(settings));}catch(Exception ex){MessageBox.Show(ex.Message,"Unable to save settings");}};
  discoveryIcmp=new LauncherCheckBox{Text="Also ping nearby addresses",Checked=settings.discoveryIcmp,Location=new Point(20,191),Size=new Size(420,24)};
  discoveryIcmp.CheckedChanged+=(s,e)=>{try{settings.discoveryIcmp=discoveryIcmp.Checked;File.WriteAllText(settingsPath,json.Serialize(settings));}catch(Exception ex){MessageBox.Show(ex.Message,"Unable to save settings");}};
  discovery.CheckedChanged+=(s,e)=>{discoveryIcmp.Enabled=discovery.Checked;if(!discovery.Checked){settings.discoveryIcmp=false;discoveryIcmp.Checked=false;}};
  infrastructureOnly=new LauncherCheckBox{Text="Show and check only routers and switches",Checked=settings.infrastructureOnly,Location=new Point(0,81),Size=new Size(318,24)};
  infrastructureOnly.CheckedChanged+=(s,e)=>{
   try {
    settings.infrastructureOnly=infrastructureOnly.Checked;
    discovery.Enabled=!settings.infrastructureOnly;
    discoveryIcmp.Enabled=discovery.Enabled&&settings.discovery;
    UpdateSettingsNote();
    File.WriteAllText(settingsPath,json.Serialize(settings));
   }catch(Exception ex){MessageBox.Show(ex.Message,"Unable to save settings");}
  };
  settingsPanel.Controls.Add(infrastructureOnly);
  lan=new LauncherCheckBox{Text="Allow other PCs on this network",Checked=settings.lan,Location=new Point(0,250),Size=new Size(318,24)};
  lan.CheckedChanged+=(s,e)=>{try{
   if(settings.lan==lan.Checked)return;
#if PACKAGED
   if(lan.Checked&&!settings.managedSharing&&!ManualTlsConfigured()) {
    if(!ConfigureSharing(this,settings,appRoot,nodePath))lan.Checked=false;
    return;
   }
#else
   if(lan.Checked&&!settings.managedSharing&&!ManualTlsConfigured()&&
    String.IsNullOrEmpty(Environment.GetEnvironmentVariable("NETWATCH_TLS_PFX"))) {
    lan.Checked=false;
    MessageBox.Show(this,"Set up sharing with the Windows installer, or configure a certificate using the Remote access guide.","Sharing needs HTTPS");
    return;
   }
#endif
   settings.lan=lan.Checked;File.WriteAllText(settingsPath,json.Serialize(settings));SendAccess("lan-preference",settings.lan?"enabled":"disabled",null,null);
  }catch(Exception ex){MessageBox.Show(ex.Message,"Unable to save settings");}};
  var access=new Button{Text="Remote access…",Location=new Point(324,240),Size=new Size(156,40)};
  access.Click+=(s,e)=>ShowAccess();
  portChecks=new LauncherCheckBox{Text="Check switch and router ports",Checked=settings.snmp??(Environment.GetEnvironmentVariable("NETWATCH_SNMP")=="1"),Location=new Point(0,108),Size=new Size(318,24)};
  portChecks.CheckedChanged+=(s,e)=>{
   if(!restoringPortPreference&&!SavePortPreference(portChecks.Checked)) {
    restoringPortPreference=true;
    portChecks.Checked=settings.snmp??(Environment.GetEnvironmentVariable("NETWATCH_SNMP")=="1");
    restoringPortPreference=false;
    MessageBox.Show(this,"Could not save the port check setting.","Port monitoring");
   }
  };
  var ports=new Button{Text="Port monitoring…",Location=new Point(324,98),Size=new Size(156,40)};
  ports.Click+=(s,e)=>ShowPortSetup();
  var data=new TextBox{Text=settings.database,ReadOnly=true,BackColor=Color.FromArgb(252,251,247),ForeColor=ForeColor,Location=new Point(0,310),Width=480,AccessibleName="Saved data location"};
  settingsPanel.Controls.AddRange(new Control[]{portChecks,ports,SettingsHeading("Local discovery",140),discovery,discoveryIcmp,
   SettingsHeading("Sharing",223),lan,access,SettingsHeading("Saved data location",285),data});
  settingsViewport.Controls.Add(settingsPanel);
  Controls.Add(settingsViewport);
  foreach(var button in new[]{lifecycle,open,settingsToggle,quit,access,ports})StyleButton(button,false);
  var menu=new ContextMenuStrip{BackColor=Color.FromArgb(252,251,247),ForeColor=ForeColor,Renderer=new ToolStripProfessionalRenderer(new NetWatchMenuColors())};menu.Items.Add("Show controls",null,(s,e)=>ShowControls());
  trayStart=new ToolStripMenuItem("Start",null,(s,e)=>StartHost());menu.Items.Add(trayStart);
  trayStop=new ToolStripMenuItem("Stop",null,(s,e)=>StopHost()){Enabled=false};menu.Items.Add(trayStop);
  trayOpen=new ToolStripMenuItem("Open dashboard",null,(s,e)=>OpenDashboard()){Enabled=false};menu.Items.Add(trayOpen);
  menu.Items.Add(new ToolStripSeparator());menu.Items.Add("Quit NetWatch",null,(s,e)=>Quit());
  tray=new NotifyIcon{Icon=Icon,Text="NetWatch: stopped",ContextMenuStrip=menu,Visible=true};tray.DoubleClick+=(s,e)=>ShowControls();
  SetState("stopped","Start NetWatch to open the dashboard.");
  ActiveControl=lifecycle;
  FormClosing+=(s,e)=>{if(e.CloseReason==CloseReason.UserClosing&&!quitting){e.Cancel=true;Hide();}};
  FormClosed+=(s,e)=>{tray.Visible=false;tray.Dispose();brandImage.Image.Dispose();};
  var showTimer=new System.Windows.Forms.Timer{Interval=250};showTimer.Tick+=(s,e)=>{if(showRequest.WaitOne(0))ShowControls();};showTimer.Start();FormClosed+=(s,e)=>showTimer.Dispose();
 }
 protected override void OnPaint(PaintEventArgs e) {
  base.OnPaint(e);
  using(var border=new Pen(Edge))e.Graphics.DrawRectangle(border,0,0,ClientSize.Width-1,ClientSize.Height-1);
 }
 void EnableWindowDrag(params Control[] grip) {
  foreach(var control in grip) {
   Point offset=Point.Empty;
   control.MouseDown+=(s,e)=>{
    if(e.Button!=MouseButtons.Left)return;
    offset=new Point(Cursor.Position.X-Left,Cursor.Position.Y-Top);
    control.Capture=true;
   };
   control.MouseMove+=(s,e)=>{
    if(control.Capture&&e.Button==MouseButtons.Left)
     Location=new Point(Cursor.Position.X-offset.X,Cursor.Position.Y-offset.Y);
   };
   control.MouseUp+=(s,e)=>control.Capture=false;
  }
 }
 Label SettingsHeading(string text,int top) {
  return new Label{Text=text,Font=new Font(Font,FontStyle.Bold),Location=new Point(0,top),AutoSize=true};
 }
 void ToggleSettings() {
  bool expanded=!settingsViewport.Visible;
  if(expanded) {
   Rectangle available=Screen.FromControl(this).WorkingArea;
   settingsViewport.Height=Math.Min(settingsPanel.Height,Math.Max(1,available.Height-settingsViewport.Top-12));
   int height=settingsViewport.Bottom+12;
   Top=Math.Max(available.Top,Math.Min(Top,available.Bottom-height));
   ClientSize=new Size(ClientSize.Width,height);
   settingsViewport.AutoScrollPosition=Point.Empty;
  } else {
   ClientSize=new Size(ClientSize.Width,settingsViewport.Top+2);
  }
  settingsViewport.Visible=expanded;
  settingsToggle.Text=expanded?"Hide s&ettings":"S&ettings…";
  Invalidate(true);
 }
 void UpdateSettingsNote() {
  settingsNote.Text=host!=null?"Stop NetWatch to change startup settings.":
   settings.infrastructureOnly?"Router and switch mode pauses local discovery.":"Startup settings apply when you start NetWatch.";
 }
 static void StyleButton(Button button,bool primary) {
  button.FlatStyle=FlatStyle.Flat;
  button.UseVisualStyleBackColor=false;
  button.BackColor=primary?Color.FromArgb(23,102,84):Color.FromArgb(252,251,247);
  button.ForeColor=primary?Paper:Ink;
  button.FlatAppearance.BorderColor=primary?Green:Edge;
  button.FlatAppearance.MouseOverBackColor=primary?Color.FromArgb(20,85,71):Color.FromArgb(231,239,230);
  button.FlatAppearance.MouseDownBackColor=primary?Ink:Color.FromArgb(218,233,221);
 }
 void ShowControls(){Show();WindowState=FormWindowState.Normal;Activate();}
 void UI(Action action){if(!IsDisposed&&IsHandleCreated)BeginInvoke(action);}
 void SetState(string next,string message) {
  state=next;
  if(next!="error")tlsError=false;
  else if(message!=null)tlsError=message.Contains("HTTPS");
  if(next=="running") {
   message=settings.icmp?"Device checks are on.":"Device checks are paused.";
   if(settings.infrastructureOnly)message+=" Router and switch mode is on.";
   if(localOnly)message+=" Dashboard available on this PC only.";
   else if(settings.lan&&accessInfo!=null&&!accessInfo.adminConfigured)message+="\nSet an admin password under Remote access.";
  }
  else if(next=="error"&&message==null)message=status.Text;
  else if(next=="error")message=tlsError?
#if PACKAGED
   "Repair sharing in Remote access, or start on this PC for now.":
#else
   "Sharing needs a valid HTTPS certificate. You can start on this PC for now.":
#endif
   "NetWatch could not continue. Check that another copy is not already running and that your saved data is available.";
  statusTitle.Text=next=="running"?"Running":next=="starting"?"Starting":
   next=="stopping"?"Stopping":next=="error"?"Needs attention":"Stopped";
  statusCard.BackColor=next=="running"?Color.FromArgb(229,240,231):next=="error"?Color.FromArgb(250,235,219):Paper;
  statusTitle.ForeColor=next=="running"?Green:Ink;
  status.Text=message;tray.Text="NetWatch: "+next;
  bool idle=host==null;
  trayStart.Enabled=idle&&!quitting;
  trayStop.Enabled=!idle&&next!="stopping";
  lifecycle.Text=idle?"&Start NetWatch":"S&top NetWatch";
  lifecycle.Enabled=idle?trayStart.Enabled:trayStop.Enabled;
  trayOpen.Enabled=next=="running";
  open.Enabled=trayOpen.Enabled||(tlsError&&idle&&!quitting);
  open.Text=tlsError?"Start on &this PC":"&Open dashboard";
  monitoring.Enabled=infrastructureOnly.Enabled=lan.Enabled=portChecks.Enabled=idle;discovery.Enabled=idle&&!settings.infrastructureOnly;discoveryIcmp.Enabled=discovery.Enabled&&settings.discovery;
  StyleButton(lifecycle,idle);
  StyleButton(open,open.Enabled);
  AcceptButton=open.Enabled?open:lifecycle;
  if(open.Enabled&&lifecycle.Focused)open.Focus();
  UpdateSettingsNote();
 }
 void StartHost(bool onlyThisPc=false) {
  if(host!=null||settingUpPorts)return;
  localOnly=onlyThisPc;
  try {
   var info=new ProcessStartInfo(nodePath,"host/desktop.js"){WorkingDirectory=appRoot,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};
   info.EnvironmentVariables["NETWATCH_DB"]=settings.database;info.EnvironmentVariables["NETWATCH_ICMP"]=settings.icmp?"1":"0";info.EnvironmentVariables["NETWATCH_DISCOVERY"]=settings.discovery?"1":"0";info.EnvironmentVariables["NETWATCH_DISCOVERY_ICMP"]=settings.discovery&&settings.discoveryIcmp?"1":"0";
   info.EnvironmentVariables["NETWATCH_INFRASTRUCTURE_ONLY"]=settings.infrastructureOnly?"1":"0";
   if(settings.snmp.HasValue)info.EnvironmentVariables["NETWATCH_SNMP"]=settings.snmp.Value?"1":"0";
   info.EnvironmentVariables["NETWATCH_SNMP_PORT_CONTEXTS"]=FormatPortContexts();
   info.EnvironmentVariables["NETWATCH_LAN"]=settings.lan&&!localOnly?"1":"0";
   if(localOnly||(settings.managedSharing&&!(settings.lan&&ManualTlsConfigured()))) {
    info.EnvironmentVariables.Remove("NETWATCH_TLS_CERT");info.EnvironmentVariables.Remove("NETWATCH_TLS_KEY");info.EnvironmentVariables.Remove("NETWATCH_TLS_PFX");
    if(settings.lan&&!localOnly)info.EnvironmentVariables["NETWATCH_TLS_PFX"]=Path.Combine(sharingPath,"netwatch.pfx");
   }
   accessInfo=null;
   host=new Process{StartInfo=info,EnableRaisingEvents=true};
   host.OutputDataReceived+=(s,e)=>{if(e.Data==null)return;try{var item=json.Deserialize<HostEvent>(e.Data);UI(()=>{if(item.type=="access"){ApplyAccess(item);return;}if(!String.IsNullOrEmpty(item.dashboardUrl))dashboardUrl=item.dashboardUrl;SetState(item.state,item.message);});}catch{}};
   host.ErrorDataReceived+=(s,e)=>{if(!String.IsNullOrWhiteSpace(e.Data))UI(()=>SetState("error","Launcher error. Check Node and the data path."));};
   host.Exited+=(s,e)=>{var ended=(Process)s;ended.WaitForExit();UI(()=>{if(host!=ended)return;ended.Dispose();host=null;accessInfo=null;if(accessWindow!=null)accessWindow.Apply(null);if(quitting)Application.Exit();else SetState(state=="error"?"error":"stopped",state=="error"?null:"NetWatch is stopped. Your data is saved.");});};
   host.Start();host.BeginOutputReadLine();host.BeginErrorReadLine();SetState("starting","Starting NetWatch…");
  } catch(Exception ex){if(host!=null){host.Dispose();host=null;}SetState("error",ex.Message);}
 }
 void ShowAccess() {
#if PACKAGED
  using(var window=new AccessWindow(SendAccess,RepairSharing,SaveConnectionFile)) {
#else
  using(var window=new AccessWindow(SendAccess)) {
#endif
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
 static string AccessRequest(string command,string mode,string password,string confirm) {
  var request=new Dictionary<string,string>{{"command",command}};
  if(mode!=null)request["mode"]=mode;
  if(password!=null){request["password"]=password;request["confirm"]=confirm;}
  return SerializeRequest(request);
 }
 static string SerializeRequest(object request) {
  return Regex.Replace(new JavaScriptSerializer().Serialize(request),@"[^\x00-\x7F]",m=>"\\u"+((int)m.Value[0]).ToString("x4"));
 }
 static HostEvent LocalAccess(string root,string node,string database,string message) {
  var info=new ProcessStartInfo(node,"host/auth-config.js --launcher"){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,StandardOutputEncoding=Encoding.UTF8};
  info.EnvironmentVariables["NETWATCH_DB"]=database;
  using(var process=Process.Start(info)) {
   process.StandardInput.WriteLine(message);process.StandardInput.Close();
   var output=process.StandardOutput.ReadToEndAsync();
   if(!process.WaitForExit(6000)){process.Kill();throw new InvalidOperationException();}
   if(process.ExitCode!=0)throw new InvalidOperationException();
   return new JavaScriptSerializer().Deserialize<HostEvent>(output.Result);
  }
 }
 void SendAccess(string command,string mode,string password,string confirm) {
  try {
   string message=AccessRequest(command,mode,password,confirm);
   if(host!=null) {
    if(state!="running")throw new InvalidOperationException();
    host.StandardInput.WriteLine(message);host.StandardInput.Flush();
   } else ApplyAccess(LocalAccess(appRoot,nodePath,settings.database,message));
  } catch {ApplyAccess(new HostEvent{error="Unable to update access settings. Check passwords and try again."});}
 }
 static bool ManualTlsConfigured() {
  return !String.IsNullOrEmpty(Environment.GetEnvironmentVariable("NETWATCH_TLS_CERT"))&&
   !String.IsNullOrEmpty(Environment.GetEnvironmentVariable("NETWATCH_TLS_KEY"));
 }
#if PACKAGED
 static DesktopSettings LoadInstalledSettings() {
  string directory=Path.GetDirectoryName(settingsPath);
  Directory.CreateDirectory(directory);
  return File.Exists(settingsPath)?new JavaScriptSerializer().Deserialize<DesktopSettings>(File.ReadAllText(settingsPath)):
   new DesktopSettings{database=Path.Combine(directory,"data","netwatch.sqlite")};
 }
 static string ChooseViewerMode(IWin32Window owner,string currentMode) {
  using(var dialog=new Form{Text="Share NetWatch on your network",ClientSize=new Size(450,225),StartPosition=owner==null?FormStartPosition.CenterScreen:FormStartPosition.CenterParent,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false}) {
   NetWatchDialogStyle.Prepare(dialog);
   var password=new RadioButton{Text="Require a viewing password",Location=new Point(16,58),Size=new Size(418,32),Checked=currentMode!="open"};
   var openMode=new RadioButton{Text="No viewer password",Location=new Point(16,94),Size=new Size(418,32),Checked=currentMode=="open"};
   var next=new Button{Text="Continue",Location=new Point(215,169),Size=new Size(105,40),DialogResult=DialogResult.OK};
   var cancel=new Button{Text="Cancel",Location=new Point(329,169),Size=new Size(105,40),DialogResult=DialogResult.Cancel};
   dialog.Controls.AddRange(new Control[]{
    new Label{Text="How should other PCs open the dashboard?",Location=new Point(16,18),Size=new Size(418,32)},
    password,openMode,
    new Label{Text="Without a password, anyone on this private network who can reach NetWatch can view the dashboard. Viewer access is read-only.",Location=new Point(34,125),Size=new Size(400,40)},
    next,cancel
   });
   dialog.AcceptButton=next;dialog.CancelButton=cancel;
   NetWatchDialogStyle.Apply(dialog);
   return dialog.ShowDialog(owner)==DialogResult.OK?(openMode.Checked?"open":"password"):null;
  }
 }
 static bool ConfigureSharing(IWin32Window owner,DesktopSettings settings,string root,string node) {
  const string title="Share NetWatch on your network";
  try {
   if(settings==null||!Path.IsPathRooted(settings.database))throw new InvalidOperationException();
   var access=LocalAccess(root,node,settings.database,AccessRequest("status",null,null,null));
   string viewerMode=ChooseViewerMode(owner,access.viewerMode);
   if(viewerMode==null)return false;
   if(viewerMode=="password"&&!access.viewerConfigured&&
     !AccessWindow.PromptPassword(owner,"Create a viewing password",(password,confirmation)=>{
      try{return LocalAccess(root,node,settings.database,AccessRequest("set-viewer-password",null,password,confirmation)).viewerConfigured;}
      catch{return false;}
     }))return false;
   if(!LocalAccess(root,node,settings.database,AccessRequest("prepare-viewer-access",null,null,null)).adminConfigured)
    throw new InvalidOperationException();
   string powershell=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell","v1.0","powershell.exe");
   var info=new ProcessStartInfo(powershell,"-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+Path.Combine(root,"host","windows-sharing.ps1")+"\" -Directory \""+sharingPath+"\""){UseShellExecute=false,CreateNoWindow=true};
   using(var process=Process.Start(info)) {
    if(!process.WaitForExit(90000)){process.Kill();throw new InvalidOperationException();}
    if(process.ExitCode!=0)throw new InvalidOperationException();
   }
   if(viewerMode!=access.viewerMode)
    LocalAccess(root,node,settings.database,AccessRequest("viewer-mode",viewerMode,null,null));
   string temporary=settingsPath+"."+Guid.NewGuid().ToString("N")+".tmp";
   var serializer=new JavaScriptSerializer();
   var chosen=serializer.Deserialize<DesktopSettings>(serializer.Serialize(settings));
   chosen.managedSharing=chosen.lan=true;
   try {
    File.WriteAllText(temporary,serializer.Serialize(chosen));
    if(File.Exists(settingsPath))File.Replace(temporary,settingsPath,null);else File.Move(temporary,settingsPath);
   } finally {File.Delete(temporary);}
   settings.managedSharing=settings.lan=true;
   MessageBox.Show(owner,"Sharing is ready. Open NetWatch and click Start. In Remote access, use Save connection file for the other PC and Copy URL for the dashboard address.",title,MessageBoxButtons.OK,MessageBoxIcon.Information);
   return true;
  } catch {
   MessageBox.Show(owner,"Windows couldn't finish sharing setup. You can retry from Remote access. To use NetWatch on this PC, turn off Allow other PCs on this network.",title,MessageBoxButtons.OK,MessageBoxIcon.Warning);
   return false;
  }
 }
 void RepairSharing() {
  if(host!=null){MessageBox.Show(accessWindow,"Click Stop in NetWatch before changing sharing setup.","Sharing setup");return;}
  if(ConfigureSharing(accessWindow,settings,appRoot,nodePath)) {
   lan.Checked=true;
   SendAccess("status",null,null,null);
  }
 }
 void SaveConnectionFile() {
  string file=Path.Combine(sharingPath,"NetWatch-connection.cer");
  if(!settings.managedSharing||!File.Exists(file)){MessageBox.Show(accessWindow,"Choose Set up or repair sharing first.","Connection file");return;}
  using(var save=new SaveFileDialog{InitialDirectory=Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),FileName="NetWatch-connection.cer",Filter="Connection certificate (*.cer)|*.cer"}) {
   if(save.ShowDialog(accessWindow)!=DialogResult.OK)return;
   try {File.Copy(file,save.FileName,true);}
   catch(IOException){MessageBox.Show(accessWindow,"Choose another location to save the connection file.","Connection file");return;}
   catch(UnauthorizedAccessException){MessageBox.Show(accessWindow,"Choose a folder you can write to.","Connection file");return;}
  }
  MessageBox.Show(accessWindow,"On the viewing PC:\n1. Open the connection file you saved from this PC. Choose Install Certificate, then Current User.\n2. Choose Place all certificates in the following store. Browse to Trusted Root Certification Authorities and finish.\n3. Open the address from Copy URL in your browser. Enter the viewing password if prompted.","Connect another PC",MessageBoxButtons.OK,MessageBoxIcon.Information);
 }
#endif
 Dictionary<string,string> EffectivePortContexts() {
  var values=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
  string inherited=Environment.GetEnvironmentVariable("NETWATCH_SNMP_PORT_CONTEXTS",EnvironmentVariableTarget.User)
   ??Environment.GetEnvironmentVariable("NETWATCH_SNMP_PORT_CONTEXTS")??"";
  foreach(string entry in inherited.Split(',')) {
   string[] parts=entry.Trim().Split('=');
   if(parts.Length==2&&IsPortContext(parts[1])&&parts[1].Length>0)values[parts[0]]=parts[1];
  }
  if(settings.snmpPortContexts!=null)
   foreach(var entry in settings.snmpPortContexts)values[entry.Key]=entry.Value;
  return values;
 }
 public static bool IsPortContext(string value) {
  return value!=null&&Regex.IsMatch(value,@"\A[A-Za-z0-9_.-]{0,32}\z");
 }
 string FormatPortContexts() {
  var entries=new List<string>();
  foreach(var entry in EffectivePortContexts())
   if(!String.IsNullOrEmpty(entry.Value))entries.Add(entry.Key+"="+entry.Value);
  return String.Join(",",entries);
 }
 string GetPortContext(string address) {
  string context;
  return EffectivePortContexts().TryGetValue(address,out context)?context??"":"";
 }
 bool SavePortContext(string address,string context) {
  if(!IsPortContext(context))return false;
  var previous=settings.snmpPortContexts;
  var values=previous==null?new Dictionary<string,string>():new Dictionary<string,string>(previous);
  values[address]=context;
  settings.snmpPortContexts=values;
  if(SavePortSettings())return true;
  settings.snmpPortContexts=previous;
  return false;
 }
 bool SavePortPreference(bool enabled) {
  if(settings.snmp==enabled)return true;
  bool? previous=settings.snmp;
  settings.snmp=enabled;
  if(SavePortSettings())return true;
  settings.snmp=previous;
  return false;
 }
 bool SavePortSettings() {
  string staged=settingsPath+"."+Guid.NewGuid().ToString("N")+".tmp";
  try {
   File.WriteAllText(staged,json.Serialize(settings));
   if(File.Exists(settingsPath))File.Replace(staged,settingsPath,null);
   else File.Move(staged,settingsPath);
   return true;
  } catch {
   return false;
  } finally {
   try {File.Delete(staged);}catch(IOException){}catch(UnauthorizedAccessException){}
  }
 }
 void ShowPortSetup() {
  if(settingUpPorts)return;
  if(host!=null) {
   MessageBox.Show(this,"Stop NetWatch, then reopen Port monitoring. Start NetWatch again when setup is complete.","Port monitoring");
   return;
  }
  settingUpPorts=true;
  try {
   using(var dialog=new PortSetupWindow(RunPortSetup,()=>{
    if(!SavePortPreference(true))return false;
    portChecks.Checked=true;
    return true;
   },GetPortContext,SavePortContext))dialog.ShowDialog(this);
  } finally {settingUpPorts=false;}
 }
 async Task<PortSetupResult> RunPortSetup(object request) {
  var info=new ProcessStartInfo(nodePath,"host/snmp-config.js --launcher"){
   WorkingDirectory=appRoot,UseShellExecute=false,CreateNoWindow=true,
   RedirectStandardInput=true,RedirectStandardOutput=true,StandardOutputEncoding=Encoding.UTF8
  };
  info.EnvironmentVariables["NETWATCH_DB"]=settings.database;
  using(var process=Process.Start(info)) {
   process.StandardInput.WriteLine(SerializeRequest(request));
   process.StandardInput.Close();
   var output=process.StandardOutput.ReadToEndAsync();
   if(!await Task.Run(()=>process.WaitForExit(35000))){
    process.Kill();
    throw new InvalidOperationException();
   }
   if(process.ExitCode!=0)throw new InvalidOperationException();
   return json.Deserialize<PortSetupResult>(await output);
  }
 }
 void StopHost(){if(host==null)return;try{host.StandardInput.WriteLine("stop");host.StandardInput.Flush();SetState("stopping","Finishing checks and saving your data…");}catch(Exception ex){SetState("error",ex.Message);}}
 void OpenDashboard(){try{Process.Start(new ProcessStartInfo(dashboardUrl){UseShellExecute=true});}catch(Exception ex){MessageBox.Show(ex.Message,"Unable to open browser");}}
 void Quit(){if(settingUpPorts)return;quitting=true;if(host==null)Application.Exit();else StopHost();}
}

public class PortSetupDevice {
 public string id {get;set;} public string label {get;set;} public string address {get;set;} public string type {get;set;} public bool configured {get;set;}
 public override string ToString(){return label+" ("+address+")"+(configured?" · configured":"");}
}
public class PortSetupResult {
 public PortSetupDevice[] devices {get;set;} public int portCount {get;set;} public string error {get;set;}
}
public class PortSetupWindow : Form {
 readonly Func<object,Task<PortSetupResult>> request;
 readonly Func<bool> enableOnStart;
 readonly Func<string,string> getContext;
 readonly Func<string,string,bool> saveContext;
 readonly ComboBox devices,algorithm;
 readonly TextBox username,authentication,privacy,context;
 readonly Label status;
 readonly Button test,enable,close,saveVlan;
 bool busy,tested;
 public PortSetupWindow(Func<object,Task<PortSetupResult>> request,Func<bool> enableOnStart,Func<string,string> getContext,Func<string,string,bool> saveContext) {
  this.request=request;
  this.enableOnStart=enableOnStart;
  this.getContext=getContext;
  this.saveContext=saveContext;
  Text="Port monitoring";ClientSize=new Size(480,544);StartPosition=FormStartPosition.CenterParent;
  FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;
  NetWatchDialogStyle.Prepare(this);

  AddLabel("Use the device’s read-only SNMPv3 account with AES-128 privacy.",16,42);
  AddLabel("Saved device",66,22);
  devices=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Location=new Point(16,91),Width=448,AccessibleName="Saved device"};
  Controls.Add(devices);
  AddLabel("Authentication algorithm",128,22);
  algorithm=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Location=new Point(16,153),Width=448,AccessibleName="Authentication algorithm"};
  algorithm.Items.AddRange(new object[]{"SHA-256","SHA-1"});
  algorithm.SelectedIndex=0;Controls.Add(algorithm);
  username=AddSecret("SNMP username",190,32);
  authentication=AddSecret("Authentication password",244,128);
  privacy=AddSecret("Privacy password",298,128);
  AddLabel("VLAN context (optional)",352,22);
  context=new TextBox{Location=new Point(16,375),Width=300,MaxLength=32,AccessibleName="VLAN context"};
  Controls.Add(context);
  saveVlan=AddButton("Save context",324,140);
  saveVlan.Location=new Point(324,365);
  saveVlan.Height=40;
  saveVlan.Click+=(s,e)=>SaveSelectedContext();
  AddLabel("Use the exact context name from the switch. Leave blank for the default.",405,22);
  status=AddLabel("Reading saved devices…",430,56);
  test=AddButton("Test connection",16,132);
  enable=AddButton("Enable monitoring",157,152);
  close=AddButton("Close",364,100);
  close.DialogResult=DialogResult.Cancel;CancelButton=close;
  test.Click+=async (s,e)=>await Submit(false);
  enable.Click+=async (s,e)=>await Submit(true);
  devices.SelectedIndexChanged+=(s,e)=>{
   var device=devices.SelectedItem as PortSetupDevice;
   context.Text=device!=null&&device.type=="switch"?getContext(device.address):"";
   ClearTest();
  };
  algorithm.SelectedIndexChanged+=(s,e)=>ClearTest();
  username.TextChanged+=(s,e)=>ClearTest();
  authentication.TextChanged+=(s,e)=>ClearTest();
  privacy.TextChanged+=(s,e)=>ClearTest();
  FormClosing+=(s,e)=>{if(busy&&e.CloseReason==CloseReason.UserClosing)e.Cancel=true;};
  Shown+=async (s,e)=>await LoadDevices();
  UpdateControls();
  NetWatchDialogStyle.Apply(this);
 }
 Label AddLabel(string text,int top,int height) {
  var label=new Label{Text=text,Location=new Point(16,top),Size=new Size(448,height)};
  Controls.Add(label);return label;
 }
 TextBox AddSecret(string label,int top,int length) {
  AddLabel(label,top,22);
  var input=new TextBox{Location=new Point(16,top+23),Width=448,MaxLength=length,UseSystemPasswordChar=true,AccessibleName=label};
  Controls.Add(input);return input;
 }
 Button AddButton(string text,int left,int width) {
  var button=new Button{Text=text,Location=new Point(left,488),Size=new Size(width,40),FlatStyle=FlatStyle.Flat,
   BackColor=Color.FromArgb(252,251,247),ForeColor=ForeColor,UseVisualStyleBackColor=false};
  button.FlatAppearance.BorderColor=Color.FromArgb(170,183,172);
  Controls.Add(button);return button;
 }
 void ClearTest() {
  if(tested)status.Text="Test the connection again after changing the device or credentials.";
  tested=false;
  UpdateControls();
 }
 void UpdateControls() {
  bool ready=!busy&&devices.SelectedItem!=null;
  devices.Enabled=!busy&&devices.Items.Count>0;
  algorithm.Enabled=username.Enabled=authentication.Enabled=privacy.Enabled=ready;
  context.Enabled=saveVlan.Enabled=ready&&((PortSetupDevice)devices.SelectedItem).type=="switch";
  test.Enabled=ready;enable.Enabled=ready&&tested;close.Enabled=!busy;
 }
 void SaveSelectedContext() {
  var device=(PortSetupDevice)devices.SelectedItem;
  var value=context.Text.Trim();
  if(!NetWatch.IsPortContext(value)) {
   status.Text="Use up to 32 letters, numbers, periods, underscores, or hyphens.";
   return;
  }
  status.Text=saveContext(device.address,value)
   ?"VLAN context saved. Start NetWatch to use it."
   :"Could not save the VLAN context.";
 }
 async Task LoadDevices() {
  busy=true;UpdateControls();
  try {
   var result=await request(new {command="list"});
   devices.Items.AddRange(result.devices);
   if(devices.Items.Count>0)devices.SelectedIndex=0;
   status.Text=devices.Items.Count>0?"Select a saved device and enter its SNMP credentials.":"Add a device with a management IP to the saved map first.";
  } catch {status.Text="Could not read saved devices. Make sure the NetWatch host is stopped.";}
  finally {busy=false;UpdateControls();}
 }
 async Task Submit(bool save) {
  var device=(PortSetupDevice)devices.SelectedItem;
  var value=context.Text.Trim();
  if(device.type=="switch"&&!NetWatch.IsPortContext(value)) {
   status.Text="Use up to 32 letters, numbers, periods, underscores, or hyphens.";
   return;
  }
  tested=false;busy=true;UpdateControls();
  status.Text=save?"Checking the connection and protecting credentials…":"Checking the switch or router for readable ports…";
  try {
   var result=await request(new {
    command=save?"enable":"test",id=device.id,address=device.address,type=device.type,
    user=new {name=username.Text,authProtocol=algorithm.SelectedIndex==0?"sha256":"sha",authKey=authentication.Text,privKey=privacy.Text}
   });
   if(result.error!=null){status.Text=result.error;return;}
   if(!save) {
    tested=true;
    status.Text="Connection passed. Read "+result.portCount+" port(s).";
    return;
   }
   bool contextSaved=device.type!="switch"||value==getContext(device.address)||saveContext(device.address,value);
   username.Clear();authentication.Clear();privacy.Clear();
   int index=devices.SelectedIndex;
   device.configured=true;
   devices.Items[index]=device;
   devices.SelectedIndex=index;
   bool enabled=enableOnStart();
   status.Text=!contextSaved?"Credentials saved. Use Save context to retry saving the VLAN context.":enabled?
    "Monitoring saved. Close this window and start NetWatch.":"Credentials saved. Turn on Check ports on next start in the launcher.";
  } catch {status.Text="Port setup could not finish. Make sure the host is stopped and try again.";}
  finally {busy=false;UpdateControls();}
 }
}

public class AccessWindow : Form {
 readonly Action<string,string,string,string> send;
 readonly ComboBox mode,urls;
 readonly ListView sessions,audit;
 readonly Label status,networkNote;
 readonly Button revoke,copy;
 bool updating;
 public AccessWindow(Action<string,string,string,string> send,Action setup=null,Action export=null) {
  this.send=send;
  int extra=setup==null?0:42;
  Text="Remote access";ClientSize=new Size(570,555+extra);FormBorderStyle=FormBorderStyle.FixedDialog;
  StartPosition=FormStartPosition.CenterParent;MaximizeBox=false;MinimizeBox=false;
  NetWatchDialogStyle.Prepare(this);
  status=new Label{Location=new Point(16,14),Size=new Size(538,44),Text="Reading access settings…"};Controls.Add(status);
  var admin=AddButton("Set admin password…",16,63,170);admin.Click+=(s,e)=>Password("admin");
  var viewer=AddButton("Set viewer password…",198,63,175);viewer.Click+=(s,e)=>Password("viewer");
  Controls.Add(new Label{Text="Viewers",Location=new Point(16,113),AutoSize=true});
  mode=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Location=new Point(85,108),Size=new Size(215,30),AccessibleName="Viewers"};
  mode.Items.AddRange(new object[]{"Open (no password)","Password","Disabled"});Controls.Add(mode);
  mode.SelectedIndexChanged+=(s,e)=>{if(!updating&&mode.SelectedIndex>=0)send("viewer-mode",new[]{"open","password","disabled"}[mode.SelectedIndex],null,null);};
  urls=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Location=new Point(16,148),Size=new Size(430,30),AccessibleName="Reachable URLs"};Controls.Add(urls);
  copy=AddButton("Copy URL",458,145,96);
  copy.Click+=(s,e)=>{if(urls.SelectedItem!=null)Clipboard.SetText((string)urls.SelectedItem);};
  networkNote=new Label{Location=new Point(16,190),Size=new Size(538,40)};Controls.Add(networkNote);
  if(setup!=null) {
   AddButton("Set up or repair sharing…",16,230,252).Click+=(s,e)=>setup();
   AddButton("Save connection file…",282,230,272).Click+=(s,e)=>export();
  }
  sessions=new ListView{View=View.Details,Location=new Point(16,235+extra),Size=new Size(538,106),FullRowSelect=true,AccessibleName="Active remote sessions"};
  sessions.Columns.Add("Role",105);sessions.Columns.Add("IP address",175);sessions.Columns.Add("Last seen",220);Controls.Add(sessions);
  revoke=AddButton("Sign out all remote sessions",16,354+extra,230);
  revoke.Click+=(s,e)=>send("revoke-sessions",null,null,null);
  Controls.Add(new Label{Text="Access log",Location=new Point(16,396+extra),AutoSize=true});
  audit=new ListView{View=View.Details,Location=new Point(16,418+extra),Size=new Size(538,125),FullRowSelect=true,AccessibleName="Access log"};
  audit.Columns.Add("Last activity",150);audit.Columns.Add("Action",190);audit.Columns.Add("Details",170);Controls.Add(audit);
  var close=AddButton("Close",458,354+extra,96);close.DialogResult=DialogResult.Cancel;CancelButton=close;
  NetWatchDialogStyle.Apply(this);
 }
 Button AddButton(string text,int x,int y,int width) {
  var button=new Button{Text=text,Location=new Point(x,y),Size=new Size(width,40),BackColor=Color.FromArgb(252,251,247),FlatStyle=FlatStyle.Flat};
  Controls.Add(button);return button;
 }
 public void Apply(HostEvent item) {
  if(item!=null&&item.error!=null){status.Text=item.error;return;}
  status.Text=item==null?"Reading access settings…":!item.adminConfigured?"Set an admin password to allow remote access.":item.viewerMode=="password"&&!item.viewerConfigured?"Set a viewer password to allow viewer sign-in.":"Remote sign-in is set up.";
  updating=true;
  mode.SelectedIndex=item==null?-1:Array.IndexOf(new[]{"open","password","disabled"},item.viewerMode);
  updating=false;
  string selection=urls.SelectedItem as string;
  urls.Items.Clear();
  if(item!=null&&item.urls!=null)urls.Items.AddRange(item.urls);
  if(urls.Items.Count>0)urls.SelectedIndex=Math.Max(0,urls.Items.IndexOf(selection??""));
  copy.Enabled=urls.Items.Count>0;
  networkNote.Text=urls.Items.Count>0?"Copy a dashboard address for the other PC. If Windows asks to allow access, choose Private networks.":"Start NetWatch with sharing on to see the dashboard address here.";
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
  PromptPassword(this,"Set "+role+" password",(password,confirmation)=>{send("set-"+role+"-password",null,password,confirmation);return true;});
 }
 public static bool PromptPassword(IWin32Window owner,string title,Func<string,string,bool> submit) {
  using(var dialog=new Form{Text=title,ClientSize=new Size(430,220),StartPosition=owner==null?FormStartPosition.CenterScreen:FormStartPosition.CenterParent,FormBorderStyle=FormBorderStyle.FixedDialog,MinimizeBox=false,MaximizeBox=false}) {
   NetWatchDialogStyle.Prepare(dialog);
   var first=new TextBox{UseSystemPasswordChar=true,MaxLength=128,Location=new Point(16,37),Width=398,AccessibleName="New password"};
   var second=new TextBox{UseSystemPasswordChar=true,MaxLength=128,Location=new Point(16,90),Width=398,AccessibleName="Confirm password"};
   var help=new Label{Text="Use at least 12 characters.",Location=new Point(16,122),Size=new Size(398,40)};
   var save=new Button{Text="Save password",Location=new Point(169,166),Size=new Size(130,40)};
   var cancel=new Button{Text="Cancel",Location=new Point(314,166),Size=new Size(100,40),DialogResult=DialogResult.Cancel};
   dialog.Controls.AddRange(new Control[]{new Label{Text="New password",Location=new Point(16,15),AutoSize=true},first,new Label{Text="Confirm password",Location=new Point(16,69),AutoSize=true},second,help,save,cancel});
   dialog.AcceptButton=save;dialog.CancelButton=cancel;
   NetWatchDialogStyle.Apply(dialog);
   save.Click+=(s,e)=>{
    if(first.Text.Length<12||first.Text!=second.Text){help.Text="Enter at least 12 characters and make both entries match.";return;}
    if(!submit(first.Text,second.Text)){help.Text="Couldn't save that password. Try a password you haven't used for NetWatch.";return;}
    dialog.DialogResult=DialogResult.OK;
   };
   return dialog.ShowDialog(owner)==DialogResult.OK;
  }
 }
}
