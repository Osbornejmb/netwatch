using System;
using System.Security.Cryptography;
using System.Text;
public class WindowsSecrets {
 public static int Main(string[] args) {
  try {
   if(args.Length!=1 || (args[0]!="protect" && args[0]!="unprotect"))return 1;
   string line=Console.ReadLine();if(line==null || line.Length>32768)return 1;
   byte[] input=Convert.FromBase64String(line);
   byte[] entropy=Encoding.UTF8.GetBytes("NetWatch.SNMP.v1");
   byte[] output=args[0]=="protect"?ProtectedData.Protect(input,entropy,DataProtectionScope.CurrentUser):ProtectedData.Unprotect(input,entropy,DataProtectionScope.CurrentUser);
   Console.WriteLine(Convert.ToBase64String(output));Array.Clear(input,0,input.Length);Array.Clear(output,0,output.Length);return 0;
  } catch {return 1;}
 }
}
