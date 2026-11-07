FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85 AS build
RUN apk add --no-cache gcc=15.2.0-r5 musl-dev=1.2.6-r3 fuse3-dev=3.18.3-r0 pkgconf=2.5.1-r0
COPY faultfs.c /build/faultfs.c
RUN cc -O2 -Wall -Wextra -Werror /build/faultfs.c -o /build/roomqc-faultfs $(pkg-config --cflags --libs fuse3) && apk info -v > /build/build-packages.txt

FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85
RUN apk add --no-cache fuse3=3.18.3-r0 && apk info -v > /usr/local/share/roomqc-faultfs-runtime-packages.txt
COPY --from=build /build/roomqc-faultfs /usr/local/bin/roomqc-faultfs
COPY --from=build /build/build-packages.txt /usr/local/share/roomqc-faultfs-build-packages.txt
COPY faultfs.c /usr/local/share/roomqc-faultfs.c
USER 0
