#!/bin/bash

# Importing sample buckets defined in environment variable CB_SAMPLES
echo "Importing Sample buckets..."

if [[ $CB_SAMPLES  ]]; then
  # Wait for the eventing service to be up and running
  for attempt in $(seq 10)
  do
    curl -s -u $CB_USERNAME:$CB_PASSWORD -X POST http://127.0.0.1:8091/sampleBuckets/install  -d "$CB_SAMPLES" > /dev/null \
      && break

    echo "Waiting for Bucket import to wakeup..."
    sleep 1
  done
fi