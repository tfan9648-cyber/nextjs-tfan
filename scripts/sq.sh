#!/bin/bash
cd /home/tfan/projects/nextjs-tfan/scripts
source venv/bin/activate
python3 stock_query.py "$@"
