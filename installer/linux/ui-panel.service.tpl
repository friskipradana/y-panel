[Unit]
Description=UI Panel Agent
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
EnvironmentFile=/etc/ui-panel/agent.env
ExecStart=/usr/local/bin/ui-panel-agent
Restart=always
RestartSec=3
User=root
WorkingDirectory=/var/lib/ui-panel

[Install]
WantedBy=multi-user.target
