[Unit]
Description=YPanel Agent
After=network-online.target docker.service
Wants=network-online.target
Wants=docker.service
StartLimitIntervalSec=0

[Service]
Type=simple
EnvironmentFile=/etc/ypanel/agent.env
ExecStart=/usr/local/bin/ypanel-agent
Restart=always
RestartSec=3
TimeoutStopSec=20
LimitNOFILE=65536
User=root
WorkingDirectory=/var/lib/ypanel

[Install]
WantedBy=multi-user.target
