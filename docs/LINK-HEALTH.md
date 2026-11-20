# How NetWatch decides a link is healthy

Open a connection on the map or expand the link health summary below the map and choose **Connections**. Each connection appears once. A shared legend explains the question-mark icon when evidence is unavailable. Lines on the map retain their device reachability colors. Link labels summarize the port evidence separately.

| State | What the host observed |
| --- | --- |
| Ports up · Forwarding unverified | Both ports report up and the host lacks current forwarding evidence. |
| Forwarding or Standby | Fresh spanning tree reports support forwarding or show an operational port held in standby. |
| Link down | A port repeatedly reported a down state. |
| Mismatch | The ends disagree, their reported speeds differ, or a port is assigned to conflicting peers. |
| Degraded link | Three consecutive compatible readings show sustained errors or discards, or a known bundle has lost a member. |
| One-sided evidence | A current reading is available for one end. |
| Link state unknown | Current port evidence is missing or insufficient. |

The link detail shows evidence scope, the last reading time, and each current reported speed where available. An overdue reading lowers the coverage count. The banner counts links monitored at both ends.

## Redundancy and layout

A baseline is the set of mapped connections you expect to protect a device. In **Edit map → Uplinks & redundancy**, choose root routers, then save a group with its protected device and mapped links. Review the draft via **Use this map → Confirm replacement**.

A device can have healthy redundancy, run without redundancy when a path is lost, be isolated, or have unknown redundancy. Devices without an accepted group display **No baseline set**. The evidence label under the device status shows whether spanning tree or bundle membership contributed to the baseline. **Based on link status only** indicates that the decision used physical port status.

Hierarchy starts with designated roots and shows distance in saved links. Unassigned devices have their own row. Admins can review single points of failure on link rows in **Connections** and for devices in **Device redundancy alerts**. Open **Map tools** below the map for incidents, recent changes, and failure estimates. These reflect the saved topology, including manual connections, and can identify a dependency before an outage.

## Link quality and bundles

A port is flagged after three consecutive compatible intervals at or above one error per second or ten discarded packets per second by default. Device reboots, counter resets, ambiguity, or missing readings interrupt the streak. Link details can show the latest derived rates even before a link is flagged.

NetWatch uses consistent LACP membership from both ends to group physical members. A bundle provides one logical path for redundancy. The admin connection list lets you expand a bundle to inspect its members. An attached aggregate ID establishes membership. Forwarding state requires separate current evidence.

Spanning tree states use the reported bridge context. A VLAN or MST instance outside that context can behave differently. [BRIDGE-MIB specification](https://datatracker.ietf.org/doc/html/rfc4188)

## Topology dynamics

Admins can schedule rediscovery of an enrolled seed, review recent topology changes, and run a saved-map failure estimate. The schedule defaults to off. Complete runs establish and compare a baseline, and scheduled proposals require the same review as manual proposals.

The what-if control estimates shared dependencies using saved connections and roots. A recognized link bundle remains available while any of its member links survives. Current port evidence drives persistent redundancy incidents, and downstream isolation is grouped under an upstream incident where the saved map establishes that dependency.
