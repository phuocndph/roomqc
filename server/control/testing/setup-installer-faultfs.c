#define FUSE_USE_VERSION 31
#define _GNU_SOURCE
#include <fuse3/fuse.h>
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include <string.h>
#include <limits.h>
#include <unistd.h>
#include <fcntl.h>
#include <dirent.h>
#include <sys/stat.h>
#include <sys/statvfs.h>

/* Owned fixture filesystem only. No user path selects a backing/control root.
 * EIO injection belongs to this mounted FUSE server; Node calls the real kernel
 * syscall and never substitutes its result. This is not a hardware disk test. */
static int backing(const char *p, char out[PATH_MAX]) {
    if (!p || p[0] != '/' || strstr(p, "/../") || strstr(p, "/./") ||
        !strcmp(p, "/..") || !strcmp(p, "/.") ||
        strlen(p) > PATH_MAX - sizeof("/backing/data")) return -EINVAL;
    snprintf(out, PATH_MAX, "/backing/data%s", p);
    return 0;
}
static int result(int value) { return value == -1 ? -errno : value; }
static const char *kind(const char *path) {
    size_t n = strlen(path);
    if (n >= 7 && !strcmp(path + n - 7, ".intent")) return "intent";
    if (n >= 6 && !strcmp(path + n - 6, ".stage")) return "stage";
    if (n >= 13 && !strcmp(path + n - 13, "/command.json")) return "journal_command";
    if (n >= 13 && !strcmp(path + n - 13, "/context.json")) return "journal_context";
    return "other";
}
static void trace(const char *op, const char *type, int error, int injected) {
    fprintf(stderr, "{\"event\":\"owned_fuse_fault\",\"operation\":\"%s\",\"kind\":\"%s\",\"errno\":%d,\"filesystemInjection\":%s}\n",
            op, type, error, injected ? "true" : "false");
    fflush(stderr);
}
static int enabled(const char *name) {
    char file[PATH_MAX];
    snprintf(file, sizeof(file), "/fault-control/%s", name);
    return access(file, F_OK) == 0;
}
static int ends(const char *value, const char *suffix) {
    size_t n = strlen(value), m = strlen(suffix);
    return n >= m && !strcmp(value + n - m, suffix);
}
static int nonempty(const char *path) {
    char b[PATH_MAX]; if (backing(path, b)) return 0;
    DIR *dir = opendir(b); if (!dir) return 0;
    struct dirent *entry; int found = 0;
    while ((entry = readdir(dir))) if (strcmp(entry->d_name, ".") && strcmp(entry->d_name, "..")) { found = 1; break; }
    closedir(dir); return found;
}
static int x_getattr(const char *p, struct stat *st, struct fuse_file_info *fi) {
    (void)fi; char b[PATH_MAX]; int e = backing(p, b);
    return e ? e : result(lstat(b, st));
}
static int x_access(const char *p, int mask) {
    char b[PATH_MAX]; int e = backing(p, b);
    return e ? e : result(access(b, mask));
}
static int x_open(const char *p, struct fuse_file_info *fi) {
    char b[PATH_MAX]; int e = backing(p, b); if (e) return e;
    int fd = open(b, fi->flags | O_NOFOLLOW); if (fd < 0) return -errno;
    fi->fh = (uint64_t)fd; return 0;
}
static int x_create(const char *p, mode_t mode, struct fuse_file_info *fi) {
    char b[PATH_MAX]; int e = backing(p, b); if (e) return e;
    int fd = open(b, fi->flags | O_CREAT | O_NOFOLLOW, mode); if (fd < 0) return -errno;
    const struct fuse_context *ctx = fuse_get_context();
    if (fchown(fd, ctx->uid, ctx->gid) < 0) { e = -errno; close(fd); return e; }
    fi->fh = (uint64_t)fd; return 0;
}
static int x_read(const char *p, char *buf, size_t n, off_t offset, struct fuse_file_info *fi) {
    (void)p; return result((int)pread((int)fi->fh, buf, n, offset));
}
static int x_write(const char *p, const char *buf, size_t n, off_t offset, struct fuse_file_info *fi) {
    if (!strcmp(kind(p), "journal_command") && enabled("fault-journal-command-write")) {
        trace("write", "journal_command", EIO, 1); return -EIO;
    }
    int r = (int)pwrite((int)fi->fh, buf, n, offset);
    if (r < 0) { int e = errno; trace("write", kind(p), e, 0); return -e; }
    return r;
}
static int x_release(const char *p, struct fuse_file_info *fi) {
    (void)p; return result(close((int)fi->fh));
}
static int x_flush(const char *p, struct fuse_file_info *fi) {
    (void)p; int fd = dup((int)fi->fh); if (fd < 0) return -errno;
    return result(close(fd));
}
static int x_fsync(const char *p, int datasync, struct fuse_file_info *fi) {
    const char *type = kind(p);
    if ((!strcmp(type, "intent") && enabled("fault-intent-sync")) ||
        (!strcmp(type, "stage") && enabled("fault-stage-sync")) ||
        (!strcmp(type, "journal_command") && enabled("fault-journal-command-sync")) ||
        (!strcmp(type, "journal_context") && enabled("fault-journal-context-sync"))) {
        trace("fsync", type, EIO, 1); return -EIO;
    }
    return result(datasync ? fdatasync((int)fi->fh) : fsync((int)fi->fh));
}
static int x_opendir(const char *p, struct fuse_file_info *fi) {
    char b[PATH_MAX]; int e = backing(p, b); if (e) return e;
    int fd = open(b, O_RDONLY | O_DIRECTORY | O_NOFOLLOW); if (fd < 0) return -errno;
    fi->fh = (uint64_t)fd; return 0;
}
static int x_readdir(const char *p, void *buf, fuse_fill_dir_t fill, off_t off,
                     struct fuse_file_info *fi, enum fuse_readdir_flags flags) {
    (void)off; (void)fi; (void)flags; char b[PATH_MAX]; int e = backing(p, b); if (e) return e;
    DIR *dir = opendir(b); if (!dir) return -errno;
    struct dirent *entry;
    while ((entry = readdir(dir))) if (fill(buf, entry->d_name, NULL, 0, 0)) break;
    closedir(dir); return 0;
}
static int x_fsyncdir(const char *p, int datasync, struct fuse_file_info *fi) {
    (void)datasync;
    const char *type = strstr(p, "/prepare-") ? "journal_prepare" :
        ends(p, "/pending") ? "journal_pending" : ends(p, "/history/published") ? "journal_archive" : NULL;
    if (type && ((!strcmp(type, "journal_prepare") && enabled("fault-journal-prepare-sync")) ||
        (!strcmp(type, "journal_pending") && nonempty(p) && enabled("fault-journal-pending-sync")) ||
        (!strcmp(type, "journal_archive") && nonempty(p) && enabled("fault-journal-archive-sync")))) {
        trace("fsync", type, EIO, 1); return -EIO;
    }
    int output = access("/backing/data/credential.json", F_OK) == 0;
    if (enabled("fault-directory-sync") ||
        (output && enabled("fault-directory-after-output")) ||
        (!output && enabled("fault-directory-before-output"))) {
        trace("fsync", "directory", EIO, 1); return -EIO;
    }
    return result(fsync((int)fi->fh));
}
static int x_mkdir(const char *p, mode_t mode) {
    char b[PATH_MAX]; int e = backing(p, b); if (e) return e;
    if (mkdir(b, mode) < 0) return -errno;
    const struct fuse_context *ctx = fuse_get_context();
    return result(chown(b, ctx->uid, ctx->gid));
}
static int x_unlink(const char *p) {
    char b[PATH_MAX]; int e = backing(p, b); return e ? e : result(unlink(b));
}
static int x_rmdir(const char *p) {
    char b[PATH_MAX]; int e = backing(p, b); return e ? e : result(rmdir(b));
}
static int x_rename(const char *from, const char *to, unsigned int flags) {
    if (flags) return -EINVAL;
    if (strstr(from, "/prepare-") && strstr(to, "/pending/") && enabled("fault-journal-pending-rename")) {
        trace("rename", "journal_prepare", EIO, 1); return -EIO;
    }
    if (strstr(from, "/pending/") && strstr(to, "/history/published/") && enabled("fault-journal-archive-rename")) {
        trace("rename", "journal_pending", EIO, 1); return -EIO;
    }
    if (enabled("fault-rename")) { trace("rename", kind(from), EIO, 1); return -EIO; }
    char a[PATH_MAX], b[PATH_MAX]; int e = backing(from, a); if (e) return e;
    e = backing(to, b); return e ? e : result(rename(a, b));
}
static int x_chmod(const char *p, mode_t mode, struct fuse_file_info *fi) {
    (void)fi; char b[PATH_MAX]; int e = backing(p, b); return e ? e : result(chmod(b, mode));
}
static int x_chown(const char *p, uid_t uid, gid_t gid, struct fuse_file_info *fi) {
    (void)fi; char b[PATH_MAX]; int e = backing(p, b); return e ? e : result(lchown(b, uid, gid));
}
static int x_truncate(const char *p, off_t size, struct fuse_file_info *fi) {
    if (fi) return result(ftruncate((int)fi->fh, size));
    char b[PATH_MAX]; int e = backing(p, b); return e ? e : result(truncate(b, size));
}
static int x_statfs(const char *p, struct statvfs *st) {
    char b[PATH_MAX]; int e = backing(p, b); return e ? e : result(statvfs(b, st));
}
static const struct fuse_operations operations = {
    .getattr=x_getattr, .access=x_access, .open=x_open, .create=x_create,
    .read=x_read, .write=x_write, .release=x_release, .flush=x_flush, .fsync=x_fsync,
    .opendir=x_opendir, .readdir=x_readdir, .releasedir=x_release, .fsyncdir=x_fsyncdir,
    .mkdir=x_mkdir, .unlink=x_unlink, .rmdir=x_rmdir, .rename=x_rename,
    .chmod=x_chmod, .chown=x_chown, .truncate=x_truncate, .statfs=x_statfs
};
int main(int argc, char *argv[]) {
    if (argc < 2 || (strcmp(argv[1], "/faults") && strcmp(argv[1], "/readonly"))) return 64;
    return fuse_main(argc, argv, &operations, NULL);
}
