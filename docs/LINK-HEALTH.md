# How NetWatch decides a link is healthy

Open a connection on the map or in **Connections** to see what each port reported. Lines on the map retain their device reachability colors. Link labels summarize the port evidence separately.

| State | What the host observed |
| --- | --- |
| Ports up · Forwarding unverified | Both ports report up and the host lacks current forwarding evidence. |
| Forwarding or Standby | Current evidence supports the forwarding or standby state. These labels require additional monitoring evidence. |
| Link down | A port repeatedly reported a down state. |
| Mismatch | The ends disagree, their reported speeds differ, or a port is assigned to conflicting peers. |
| Degraded link | Available evidence shows reduced link health. |
| One-sided evidence | A current reading is available for one end. |
| Link state unknown | Current port evidence is missing or insufficient. |

The link detail shows evidence scope, the last reading time, and each current reported speed where available. An overdue reading lowers the coverage count. The banner counts links monitored at both ends.

## Redundancy and layout

A baseline is the set of mapped connections you expect to protect a device. In **Edit map → Uplinks & redundancy**, choose root routers, then save a group with its protected device and mapped links. Review the draft via **Use this map → Confirm replacement**.

A device can have healthy redundancy, run without redundancy when a path is lost, be isolated, or have unknown redundancy. Devices without an accepted group display **No baseline set**. The **Based on link status only** label describes the scope of the current checks.

Hierarchy starts with designated roots and shows distance in saved links. Unassigned devices have their own row. Admins can review single points of failure in **Link attention**. These reflect the saved topology, including manual connections, and can identify a dependency before an outage.
