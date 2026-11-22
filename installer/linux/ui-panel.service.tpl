[Unit]
Description=Reneo Agent (legacy template)
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
EnvironmentFile=/etc/reneo/agent.env
ExecStart=/usr/local/bin/reneo-agent
Restart=always
RestartSec=3
User=root
WorkingDirectory=/var/lib/reneo

[Install]
WantedBy=multi-user.target
