# Run NetWatch on Linux

The Linux x64 archive contains the built dashboard, local host and runtime dependencies. Install Node.js 22.13 or newer before starting it.

1. Download `NetWatch-0.2.5-Linux-x64.tar.gz` and `SHA256SUMS.txt` from the same release. Verify the archive against its entry in the checksum file.
2. Extract the archive and enter the extracted directory.
3. Run `npm start` and open `http://127.0.0.1:4317`. Keep the terminal open while using the host. Press Ctrl+C to stop it.

The host binds to loopback by default. Its database is `data/netwatch.sqlite` relative to the extracted directory unless you set `NETWATCH_DB` to an absolute path. Keep an offline backup when upgrading.

Linux supports the dashboard, map editing, and local storage. Run the Windows host for ICMP, SNMPv3 port monitoring, and active discovery. The Windows installer includes the tray launcher.
