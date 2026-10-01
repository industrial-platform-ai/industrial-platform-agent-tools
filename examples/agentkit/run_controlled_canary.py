"""Execute the explicitly authorized one-atomic Industrial Platform AgentKit canary."""

import sys

from clean_room_hash_canary import main

if __name__ == "__main__":
    sys.argv = ["clean_room_hash_canary.py", "--pay"]
    main()
