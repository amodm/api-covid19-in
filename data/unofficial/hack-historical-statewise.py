#!/usr/bin/env python
import sys
import re
import json
import collections

with open(sys.argv[1], "r") as fp:
    records = list()
    lines = filter(lambda s: not re.match("^\\d+$", s), map(lambda s: s.strip(), fp.readlines()))
    lines = lines[1:]
    for line in lines:
        m = re.match(r'^([^\d]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)?.*', line)
        if m:
            state = m.group(1)
            confirmed = int(m.group(2))
            recovered = int(m.group(3))
            deaths = int(m.group(4))
            active = int(m.group(5))
            if not active:
                active = 0
            records.append(collections.OrderedDict([
                ("state", state.strip()),
                ("confirmed", confirmed),
                ("recovered", recovered),
                ("deaths", deaths),
                ("active", active)
            ]))
    totalRecord = records[0]
    totalRecord.pop('state')
    print json.dumps(collections.OrderedDict([("day", sys.argv[2]), ("total", totalRecord), ("statewise", records[1:])]))
