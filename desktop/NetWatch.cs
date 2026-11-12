using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Security.Principal;
using System.Threading;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public class DesktopSettings {
 public string node {get;set;} public string root {get;set;} public string database {get;set;} public bool icmp {get;set;}
}
public class HostEvent {public string state {get;set;} public string message {get;set;}}
public class NetWatch : Form {
 readonly string settingsPath=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"desktop.json");
 readonly JavaScriptSerializer json=new JavaScriptSerializer();
 DesktopSettings settings;
 Process host;
 NotifyIcon tray;
 Label status;
 CheckBox monitoring;
 Button start,stop,open;
 ToolStripMenuItem trayStart,trayStop,trayOpen;
 bool quitting=false;
 string state="stopped";

 [STAThread] public static void Main() {
  bool first;
  using(var showRequest=new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\NetWatch.Show."+WindowsIdentity.GetCurrent().User.Value))
  using(var single=new Mutex(true,"Local\\NetWatch.Desktop."+WindowsIdentity.GetCurrent().User.Value,out first)) {
   if(!first){showRequest.Set();return;}
   Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
   try {Application.Run(new NetWatch(showRequest));}
   catch(Exception e){MessageBox.Show(e.Message,"NetWatch startup",MessageBoxButtons.OK,MessageBoxIcon.Error);}
  }
 }
 public NetWatch(EventWaitHandle showRequest) {
  settings=json.Deserialize<DesktopSettings>(File.ReadAllText(settingsPath));
  if(settings==null||!Path.IsPathRooted(settings.database)||!File.Exists(settings.node)||!File.Exists(Path.Combine(settings.root,"host","desktop.js")))throw new Exception("Launcher paths are unavailable. Run desktop:setup again from the current checkout.");
  Text="NetWatch — Host controls";ClientSize=new Size(540,330);Font=new Font(SystemFonts.MessageBoxFont.FontFamily,10);
  FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;Icon=SystemIcons.Application;
  var title=new Label{Text="NetWatch local host",Font=new Font(Font,FontStyle.Bold),Location=new Point(20,18),AutoSize=true};Controls.Add(title);
  status=new Label{Text="Stopped",Location=new Point(20,55),Size=new Size(500,65),AccessibleName="Host status"};Controls.Add(status);
  start=new Button{Text="&Start",Location=new Point(20,125),Size=new Size(110,40)};start.Click+=(s,e)=>StartHost();Controls.Add(start);
  stop=new Button{Text="S&top",Location=new Point(140,125),Size=new Size(110,40),Enabled=false};stop.Click+=(s,e)=>StopHost();Controls.Add(stop);
  open=new Button{Text="&Open dashboard",Location=new Point(260,125),Size=new Size(160,40),Enabled=false};open.Click+=(s,e)=>OpenDashboard();Controls.Add(open);
  var quit=new Button{Text="&Quit",Location=new Point(430,125),Size=new Size(90,40)};quit.Click+=(s,e)=>Quit();Controls.Add(quit);
  monitoring=new CheckBox{Text="Enable ICMP collector on next start",Checked=settings.icmp,Location=new Point(20,180),AutoSize=true};
  monitoring.CheckedChanged+=(s,e)=>{try{settings.icmp=monitoring.Checked;File.WriteAllText(settingsPath,json.Serialize(settings));}catch(Exception ex){MessageBox.Show(ex.Message,"Unable to save settings");}};Controls.Add(monitoring);
  var data=new TextBox{Text="Data: "+settings.database,ReadOnly=true,Multiline=true,BorderStyle=BorderStyle.None,BackColor=SystemColors.Control,Location=new Point(20,215),Size=new Size(500,40),AccessibleName="Database location"};Controls.Add(data);
  Controls.Add(new Label{Text="Per-device authorization is required. Close hides to the tray. Stop/Quit\ndisconnect all dashboard clients. This is not a Windows service.",Location=new Point(20,265),Size=new Size(500,55)});
  var menu=new ContextMenuStrip();menu.Items.Add("Show controls",null,(s,e)=>ShowControls());
  trayStart=new ToolStripMenuItem("Start",null,(s,e)=>StartHost());menu.Items.Add(trayStart);
  trayStop=new ToolStripMenuItem("Stop",null,(s,e)=>StopHost()){Enabled=false};menu.Items.Add(trayStop);
  trayOpen=new ToolStripMenuItem("Open dashboard",null,(s,e)=>OpenDashboard()){Enabled=false};menu.Items.Add(trayOpen);
  menu.Items.Add(new ToolStripSeparator());menu.Items.Add("Quit (stop host)",null,(s,e)=>Quit());
  tray=new NotifyIcon{Icon=Icon,Text="NetWatch: stopped",ContextMenuStrip=menu,Visible=true};tray.DoubleClick+=(s,e)=>ShowControls();
  FormClosing+=(s,e)=>{if(e.CloseReason==CloseReason.UserClosing&&!quitting){e.Cancel=true;Hide();}};
  FormClosed+=(s,e)=>{tray.Visible=false;tray.Dispose();};
  var showTimer=new System.Windows.Forms.Timer{Interval=250};showTimer.Tick+=(s,e)=>{if(showRequest.WaitOne(0))ShowControls();};showTimer.Start();FormClosed+=(s,e)=>showTimer.Dispose();
 }
 void ShowControls(){Show();WindowState=FormWindowState.Normal;Activate();}
 void UI(Action action){if(!IsDisposed&&IsHandleCreated)BeginInvoke(action);}
 void SetState(string next,string message) {
  state=next;status.Text=message;status.AccessibleName="Host status: "+message;tray.Text="NetWatch: "+next;
  bool idle=host==null;
  start.Enabled=trayStart.Enabled=idle&&!quitting;stop.Enabled=trayStop.Enabled=!idle&&next!="stopping";
  open.Enabled=trayOpen.Enabled=next=="running";monitoring.Enabled=idle;
 }
 void StartHost() {
  if(host!=null)return;
  try {
   var info=new ProcessStartInfo(settings.node,"host/desktop.js"){WorkingDirectory=settings.root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};
   info.EnvironmentVariables["NETWATCH_DB"]=settings.database;info.EnvironmentVariables["NETWATCH_ICMP"]=settings.icmp?"1":"0";
   host=new Process{StartInfo=info,EnableRaisingEvents=true};
   host.OutputDataReceived+=(s,e)=>{if(e.Data==null)return;try{var item=json.Deserialize<HostEvent>(e.Data);UI(()=>SetState(item.state,item.message));}catch{}};
   host.ErrorDataReceived+=(s,e)=>{if(!String.IsNullOrWhiteSpace(e.Data))UI(()=>SetState("error","Launcher error. Check Node and the data path."));};
   host.Exited+=(s,e)=>{var ended=(Process)s;ended.WaitForExit();UI(()=>{if(host!=ended)return;ended.Dispose();host=null;if(quitting)Application.Exit();else SetState(state=="error"?"error":"stopped",state=="error"?status.Text:"NetWatch stopped. Database closed.");});};
   host.Start();host.BeginOutputReadLine();host.BeginErrorReadLine();SetState("starting","Starting NetWatch…");
  } catch(Exception ex){if(host!=null){host.Dispose();host=null;}SetState("error",ex.Message);}
 }
 void StopHost(){if(host==null)return;try{host.StandardInput.WriteLine("stop");host.StandardInput.Flush();SetState("stopping","Waiting for checks and database to close…");}catch(Exception ex){SetState("error",ex.Message);}}
 void OpenDashboard(){try{Process.Start(new ProcessStartInfo("http://127.0.0.1:4317"){UseShellExecute=true});}catch(Exception ex){MessageBox.Show(ex.Message,"Unable to open browser");}}
 void Quit(){quitting=true;if(host==null)Application.Exit();else StopHost();}
}
