"""Read-only Linux/Docker resource observation. No environment or credentials read.

Run via SSH stdin, e.g. python3 - --samples 7 --interval 10 < this_file.
Reports observed usage, never a user limit or a deployment capacity approval.
"""
import argparse
import datetime
import json
import os
import pathlib
import re
import subprocess
import sys
import time


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=15)
    if result.returncode:
        raise RuntimeError('RESOURCE_OBSERVATION_COMMAND_FAILED')
    return result.stdout


def text(path):
    return pathlib.Path(path).read_text(encoding='utf8')


def pairs(path, allowed):
    return {k: int(v) for line in text(path).splitlines()
            for k, v in [line.split()] if k in allowed}


def pressure(path):
    if not pathlib.Path(path).is_file():
        return None
    result = {}
    for line in text(path).splitlines():
        parts = line.split()
        if parts[0] not in ('some', 'full'):
            continue
        result[parts[0]] = {k: float(v) for item in parts[1:]
                            for k, v in [item.split('=')]
                            if k in ('avg10', 'avg60', 'avg300', 'total')}
    return result


def disk(path):
    v = os.statvfs(path)
    total, available = v.f_blocks * v.f_frsize, v.f_bavail * v.f_frsize
    return {'path': path, 'totalBytes': total, 'availableBytes': available,
            'freePercent': available * 100 / total,
            'inodes': v.f_files, 'freeInodes': v.f_favail}


def containers():
    ids = run(['docker', 'ps', '--no-trunc', '--format', '{{.ID}}']).split()
    if len(ids) > 256 or any(not re.fullmatch(r'[a-f0-9]{64}', x) for x in ids):
        raise RuntimeError('RESOURCE_OBSERVATION_INVENTORY_INVALID')
    if not ids:
        return []
    # The Docker response is restricted at its source. Never request env,
    # mount contents, labels, commands, logs or arbitrary HostConfig fields.
    template = ('{"id":{{json .Id}},"name":{{json .Name}},'
                '"pid":{{.State.Pid}},"memory":{{.HostConfig.Memory}},'
                '"memorySwap":{{.HostConfig.MemorySwap}},'
                '"nanoCpus":{{.HostConfig.NanoCpus}},'
                '"cpuQuota":{{.HostConfig.CpuQuota}},'
                '"cpuPeriod":{{.HostConfig.CpuPeriod}},'
                '"pidsLimit":{{json .HostConfig.PidsLimit}}}')
    return sorted([json.loads(line) for line in
                   run(['docker', 'inspect', '--format', template, *ids]).splitlines()],
                  key=lambda row: row['id'])


def cgroup(pid):
    try:
        rows = text('/proc/' + str(pid) + '/cgroup').splitlines()
        path = next(row[3:] for row in rows if row.startswith('0::'))
        base = pathlib.Path('/sys/fs/cgroup').resolve()
        target = (base / path.lstrip('/')).resolve()
        if base not in target.parents:
            raise ValueError()
        scalar = lambda name: int(text(target / name).strip())
        return {'memoryBytes': scalar('memory.current'),
                'swapBytes': scalar('memory.swap.current'),
                'pids': scalar('pids.current'),
                'cpu': pairs(target / 'cpu.stat', {'usage_usec', 'nr_periods',
                                                  'nr_throttled', 'throttled_usec'}),
                'memoryEvents': pairs(target / 'memory.events',
                                      {'low', 'high', 'max', 'oom', 'oom_kill', 'oom_group_kill'})}
    except (OSError, ValueError, StopIteration):
        # A stopped/restarted container or unavailable cgroup is unknown, not zero.
        return None


def sample(previous, docker_root):
    ticks = [int(x) for x in text('/proc/stat').splitlines()[0].split()[1:9]]
    now = time.monotonic()
    cpu = None
    if previous:
        deltas = [x - y for x, y in zip(ticks, previous['_ticks'])]
        total = sum(deltas)
        if total <= 0 or min(deltas) < 0:
            raise RuntimeError('RESOURCE_OBSERVATION_CLOCK_INVALID')
        cpu = {'usedPercent': 100 * (total - deltas[3] - deltas[4]) / total,
               'ioWaitPercent': 100 * deltas[4] / total,
               'stealPercent': 100 * deltas[7] / total}
    mem = {}
    for line in text('/proc/meminfo').splitlines():
        key, value = line.split(':', 1)
        if key in ('MemTotal', 'MemAvailable', 'SwapTotal', 'SwapFree', 'Dirty', 'Writeback'):
            mem[key + 'Bytes'] = int(value.split()[0]) * 1024
    rows = containers()
    old = {row['id']: row for row in previous['containers']} if previous else {}
    for row in rows:
        values = row['cgroup'] = cgroup(row['pid'])
        before = old.get(row['id'], {})
        row['cpuUsagePercentOfOneCore'] = None
        if values and before.get('cgroup') and row['pid'] == before['pid']:
            delta = values['cpu']['usage_usec'] - before['cgroup']['cpu']['usage_usec']
            if delta >= 0:
                row['cpuUsagePercentOfOneCore'] = 100 * delta / ((now - previous['_monotonic']) * 1_000_000)
    return {'at': utc(), '_monotonic': now, '_ticks': ticks,
            'cpu': cpu, 'loadAverage': list(os.getloadavg()), 'memory': mem,
            'pressure': {kind: pressure('/proc/pressure/' + kind) for kind in ('cpu', 'memory', 'io')},
            'filesystems': [disk(path) for path in dict.fromkeys(['/', docker_root])],
            'containers': rows}


def observe(count, interval):
    if sys.platform != 'linux' or not pathlib.Path('/sys/fs/cgroup/cgroup.controllers').is_file():
        raise RuntimeError('RESOURCE_OBSERVATION_LINUX_CGROUP_V2_REQUIRED')
    docker_root = json.loads(run(['docker', 'info', '--format', '{{json .DockerRootDir}}']))
    samples = []
    started = utc()
    for index in range(count):
        if samples:
            time.sleep(interval)
        current = sample(samples[-1] if samples else None, docker_root)
        samples.append(current)
        print(json.dumps({'event': 'resource_observation_sample', 'index': index + 1,
                          'count': count, 'at': current['at'],
                          'containers': len(current['containers']),
                          'memoryAvailableBytes': current['memory']['MemAvailableBytes'],
                          'diskAvailableBytes': current['filesystems'][0]['availableBytes']}), flush=True)
    fingerprints = [json.dumps([{k: v for k, v in row.items()
                                 if k not in ('cgroup', 'cpuUsagePercentOfOneCore')}
                                for row in s['containers']], sort_keys=True) for s in samples]
    missing = sum(row['cgroup'] is None for s in samples for row in s['containers'])
    latest = samples[-1]
    summary = {'logicalCpus': os.cpu_count(),
               'durationSeconds': latest['_monotonic'] - samples[0]['_monotonic'],
               'sampleCount': count, 'inventoryStable': len(set(fingerprints)) == 1,
               'missingCgroupSamples': missing,
               'minimumMemoryAvailableBytes': min(s['memory']['MemAvailableBytes'] for s in samples),
               'maximumSwapUsedBytes': max(s['memory']['SwapTotalBytes'] - s['memory']['SwapFreeBytes'] for s in samples),
               'minimumDiskAvailableBytes': min(s['filesystems'][0]['availableBytes'] for s in samples),
               'unboundedMemoryContainers': [row['name'] for row in latest['containers'] if row['memory'] == 0],
               'unboundedCpuContainers': [row['name'] for row in latest['containers']
                                          if row['nanoCpus'] <= 0 and row['cpuQuota'] <= 0],
               'observedHostCpuPeakPercent': max(s['cpu']['usedPercent'] for s in samples[1:]),
               'diskAdmissionAllowed': all(d['freePercent'] >= 15 and d['availableBytes'] >= 10 * 1024**3
                                           for s in samples for d in s['filesystems'])}
    for s in samples:
        del s['_ticks']
        del s['_monotonic']
        for row in s['containers']:
            del row['pid']
    return {'kind': 'roomqc-vps-resource-observation', 'schemaVersion': 1,
            'startedAt': started, 'finishedAt': utc(), 'summary': summary, 'samples': samples,
            'readOnly': True, 'runtimeChanged': False, 'capacityProven': False,
            'deploymentReady': False, 'signupOpened': False,
            'limits': ['A short baseline cannot establish workload peaks, safe user concurrency, RPO/RTO or capacity.',
                       'Existing containers and their limits are observed, never changed.',
                       'Missing cgroup observations are unknown; unbounded consumers are not assigned zero demand.',
                       'No proposed RoomQC service allocation or rolling/backup overlap is included.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--samples', type=int, default=7)
    parser.add_argument('--interval', type=float, default=10)
    args = parser.parse_args()
    if not 2 <= args.samples <= 31 or not 1 <= args.interval <= 60 or (args.samples - 1) * args.interval > 600:
        parser.error('Use 2..31 samples and 1..60 seconds, total interval at most 600 seconds')
    try:
        print(json.dumps({'event': 'resource_observation_complete', 'report': observe(args.samples, args.interval)}), flush=True)
    except Exception:
        # Never serialize exceptions or captured Docker diagnostics.
        print(json.dumps({'event': 'resource_observation_failed', 'code': 'RESOURCE_OBSERVATION_FAILED'}), flush=True)
        sys.exit(1)
