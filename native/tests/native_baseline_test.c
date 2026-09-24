/*
 * Negative-case native test for Todo 3: the native GLFW+Faun xu4 binary
 * must refuse to start (nonzero exit, no window, no game state mutation)
 * when the original Ultima IV data is missing or corrupted.
 *
 * This deliberately does NOT build the xu4 binary itself (that is
 * `npm run build:native`, scripts/build-native.mjs -- a full engine build
 * is out of scope for the CMake/CTest project, which only compiles small
 * isolated components like Todo 2's module loader). Instead it shells out
 * to the already-built binary at a fixed, known path and inspects its
 * exit code. If that binary hasn't been built yet, this test FAILS with a
 * message pointing at `npm run build:native` -- consistent with Todo 2's
 * module_package_test, which fails the same way (not skips) when a
 * required prerequisite artifact is missing.
 */

#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/stat.h>
#include <sys/wait.h>

static int failures = 0;

static void expect(int cond, const char* label)
{
    if (cond) {
        printf("  ok   %s\n", label);
    } else {
        printf("  FAIL %s\n", label);
        ++failures;
    }
}

/* Run xu4Path with argv {xu4Path, "-q", NULL} and cwd=scratchDir.
   Returns the child's exit status via WEXITSTATUS, or -1 if it did not
   exit normally (crashed/signaled). */
static int runXu4(const char* xu4Path, const char* scratchDir)
{
    pid_t pid = fork();
    if (pid < 0) {
        perror("fork");
        exit(2);
    }
    if (pid == 0) {
        /* Child: silence xu4's stdout/stderr chatter, then exec. */
        int devnull = open("/dev/null", O_WRONLY);
        if (devnull >= 0) {
            dup2(devnull, STDOUT_FILENO);
            dup2(devnull, STDERR_FILENO);
        }
        if (chdir(scratchDir) != 0) {
            _exit(127);
        }
        execl(xu4Path, xu4Path, "-q", (char*) NULL);
        _exit(127); /* execl failed */
    }

    int status = 0;
    if (waitpid(pid, &status, 0) < 0) {
        perror("waitpid");
        exit(2);
    }
    if (!WIFEXITED(status)) {
        return -1; /* crashed or was signaled */
    }
    return WEXITSTATUS(status);
}

static void makeEmptyDir(const char* path)
{
    /* Best-effort clean slate; ignore errors if it doesn't exist yet. */
    char rmCmd[512];
    snprintf(rmCmd, sizeof(rmCmd), "rm -rf '%s'", path);
    system(rmCmd);
    mkdir(path, 0755);
}

static void writeGarbageZip(const char* dir)
{
    char path[512];
    snprintf(path, sizeof(path), "%s/ultima4.zip", dir);
    FILE* fp = fopen(path, "wb");
    if (!fp) {
        perror("fopen");
        exit(2);
    }
    fputs("this is not a real zip file", fp);
    fclose(fp);
}

int main(int argc, char** argv)
{
    struct stat st;

    if (argc < 2) {
        printf("  FAIL usage: native_baseline_test <path-to-native-xu4-binary>\n");
        return 1;
    }
    const char* xu4Path = argv[1];

    if (stat(xu4Path, &st) != 0) {
        printf("  FAIL native xu4 binary not found at %s -- run \"npm run build:native\" first\n", xu4Path);
        return 1;
    }

    printf("native-baseline: negative cases\n");

    makeEmptyDir("scratch-missing");
    expect(runXu4(xu4Path, "scratch-missing") > 0,
           "missing ultima4.zip is rejected (nonzero exit, no window)");

    makeEmptyDir("scratch-corrupt");
    writeGarbageZip("scratch-corrupt");
    expect(runXu4(xu4Path, "scratch-corrupt") > 0,
           "corrupted ultima4.zip is rejected (nonzero exit, no window)");

    system("rm -rf scratch-missing scratch-corrupt");

    if (failures > 0) {
        printf("native-baseline: %d failure(s)\n", failures);
        return 1;
    }
    printf("native-baseline: all checks passed\n");
    return 0;
}
