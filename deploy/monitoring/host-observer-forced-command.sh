#!/bin/sh
# This file is the complete SSH command for the observer key. Never evaluate
# SSH_ORIGINAL_COMMAND: the key may read these host facts and nothing else.
set -eu
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
printf 'ROOMQC_SSH_VERIFIED\n'
hostname
uname -srmo
. /etc/os-release
printf 'OS=%s\n' "$PRETTY_NAME"
printf 'CPU=%s\n' "$(nproc)"
free -b | awk 'NR==2{printf "MEM_TOTAL=%s MEM_AVAILABLE=%s\n",$2,$7}'
df -P -B1 / | awk 'NR==2{printf "ROOT_TOTAL=%s ROOT_USED=%s ROOT_AVAILABLE=%s ROOT_USE=%s\n",$2,$3,$4,$5}'
if command -v docker >/dev/null 2>&1; then
  docker --version | sed 's/^Docker version /DOCKER_VERSION=/'
  docker info --format 'DOCKER_SERVER={{.ServerVersion}}' 2>/dev/null || true
else
  printf 'DOCKER=missing\n'
fi
cpu_sample() {
  awk '/^cpu / {total=0; for(i=2;i<=9;i++)total+=$i; print total, $5+$6; exit}' /proc/stat
}
set -- $(cpu_sample)
total1="$1"; idle1="$2"
sleep 1
set -- $(cpu_sample)
awk -v t1="$total1" -v i1="$idle1" -v t2="$1" -v i2="$2" \
  'BEGIN {dt=t2-t1; di=i2-i1; if(dt<=0 || di<0 || di>dt)exit 1; printf "HOST_CPU_USAGE=%.2f\n",100*(1-di/dt)}'
