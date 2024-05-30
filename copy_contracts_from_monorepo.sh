#!/bin/bash

rsync -avr --progress --exclude='node_modules/' --exclude='wallets' --exclude='artifacts' --include='*/' --include='*'  /Users/chris/Documents/WorkStuff/LIT/lit-assets/blockchain/contracts/ ./