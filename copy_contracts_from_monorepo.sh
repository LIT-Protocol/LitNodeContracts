#!/bin/bash

rsync -avr --progress --include="*/" --exclude="deployments" /Users/chris/Documents/WorkStuff/LIT/lit-assets/blockchain/contracts/lit-node/contracts ./