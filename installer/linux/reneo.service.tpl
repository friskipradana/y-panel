[Unit]
Description=Reneo Agent
After=network-online.target docker.service
Wants=network-online.target
Wants=docker.service
StartLimitIntervalSec=0

[Service]
Type=simple
EnvironmentFile=/etc/reneo/agent.env
ExecStart=/usr/local/bin/reneo-agent
Restart=always
RestartSec=3
TimeoutStopSec=20
LimitNOFILE=65536
User=root
WorkingDirectory=/var/lib/reneo

[Install]
WantedBy=multi-user.target
Alias=ypanel.service
