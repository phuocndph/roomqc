ARG SOURCE_DATE_EPOCH
FROM golang@sha256:3747dcba41c8b0db3211fda4db61638b980e17ac5bb3c94460a975a9cfe19395 AS build
ARG SOURCE_DATE_EPOCH
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOTOOLCHAIN=local
WORKDIR /source
COPY . .
RUN go test ./internal/api -run '^TestRoomQCPassword' -count=1
RUN test -n "$SOURCE_DATE_EPOCH" && \
    go build -trimpath -buildvcs=false -ldflags "-X github.com/supabase/auth/internal/utilities.Version=v2.197.0-roomqc-password-guard.1" -o /out/auth . && \
    touch --date="@$SOURCE_DATE_EPOCH" /out/auth

# Keep the exact pinned vendor runtime, migrations, user and command.
FROM supabase/gotrue@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b
COPY --from=build /out/auth /usr/local/bin/auth
