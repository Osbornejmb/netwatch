using System;
using System.Globalization;
using System.Net;
using System.Net.NetworkInformation;

// Compiled with the Windows .NET Framework compiler. Literal address arguments
// are data; this executable never launches a shell, child process or DNS query.
public static class NetWatchPing {
    public static int Main(string[] args) {
        try {
            IPAddress address;
            int timeout;
            if (args.Length != 2 || !IPAddress.TryParse(args[0], out address) ||
                !Int32.TryParse(args[1], out timeout) || timeout != 1500) {
                Console.WriteLine("{\"outcome\":\"error\",\"code\":\"icmp_local_error\"}");
                return 0;
            }
            using (Ping ping = new Ping()) {
                PingReply reply = ping.Send(address, timeout);
                if (reply.Status == IPStatus.Success) {
                    Console.WriteLine("{\"outcome\":\"reachable\",\"reason\":\"success\",\"latencyMs\":" + reply.RoundtripTime.ToString(CultureInfo.InvariantCulture) + "}");
                } else {
                    string reason = reply.Status.ToString();
                    switch (reason) {
                        case "TimedOut":
                        case "DestinationNetworkUnreachable":
                        case "DestinationHostUnreachable":
                        case "DestinationProtocolUnreachable":
                        case "DestinationPortUnreachable":
                        case "DestinationUnreachable":
                        case "TtlExpired":
                        case "TimeExceeded":
                        case "TtlReassemblyTimeExceeded":
                        case "PacketTooBig":
                            Console.WriteLine("{\"outcome\":\"unreachable\",\"reason\":\"" + reason + "\",\"latencyMs\":null}");
                            break;
                        default:
                            Console.WriteLine("{\"outcome\":\"error\",\"code\":\"icmp_local_error\"}");
                            break;
                    }
                }
            }
        } catch {
            Console.WriteLine("{\"outcome\":\"error\",\"code\":\"icmp_exception\"}");
        }
        return 0;
    }
}
