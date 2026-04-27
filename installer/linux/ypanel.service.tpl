[Unit]
Description=YPanel Agent
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
EnvironmentFile=/etc/ypanel/agent.env
ExecStart=/usr/local/bin/ypanel-agent
Restart=always
RestartSec=3
User=root
WorkingDirectory=/var/lib/ypanel

[Install]
WantedBy=multi-user.target
