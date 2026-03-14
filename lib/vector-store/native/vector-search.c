#include <errno.h>
#include <fcntl.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

typedef struct {
  ssize_t index;
  float score;
  bool filled;
} Match;

static void insert_match(Match *matches, size_t limit, ssize_t index, float score) {
  if (limit == 0) return;

  size_t pos = 0;
  while (pos < limit && matches[pos].filled && matches[pos].score >= score) {
    pos++;
  }
  if (pos >= limit) return;

  for (size_t i = limit - 1; i > pos; i--) {
    matches[i] = matches[i - 1];
  }

  matches[pos].index = index;
  matches[pos].score = score;
  matches[pos].filled = true;
}

static int read_query(float *query, size_t query_bytes) {
  size_t read_total = 0;
  while (read_total < query_bytes) {
    ssize_t chunk = read(
      STDIN_FILENO,
      ((char *)query) + read_total,
      query_bytes - read_total
    );
    if (chunk == 0) break;
    if (chunk < 0) return -1;
    read_total += (size_t)chunk;
  }
  return read_total == query_bytes ? 0 : -1;
}

int main(int argc, char **argv) {
  if (argc != 4) {
    fprintf(stderr, "usage: %s <vectors-file> <dimension> <top-k>\n", argv[0]);
    return 1;
  }

  const char *vectors_path = argv[1];
  char *endptr = NULL;
  long dimension_value = strtol(argv[2], &endptr, 10);
  if (endptr == argv[2] || dimension_value <= 0) {
    fprintf(stderr, "invalid dimension\n");
    return 1;
  }

  endptr = NULL;
  long top_k_value = strtol(argv[3], &endptr, 10);
  if (endptr == argv[3] || top_k_value <= 0) {
    fprintf(stderr, "invalid top-k\n");
    return 1;
  }

  size_t dimension = (size_t)dimension_value;
  size_t top_k = (size_t)top_k_value;
  size_t vector_bytes = dimension * sizeof(float);

  float *query = malloc(vector_bytes);
  if (!query) {
    fprintf(stderr, "allocation failed\n");
    return 1;
  }

  if (read_query(query, vector_bytes) != 0) {
    fprintf(stderr, "failed to read query vector: %s\n", strerror(errno));
    free(query);
    return 1;
  }

  int fd = open(vectors_path, O_RDONLY);
  if (fd < 0) {
    fprintf(stderr, "failed to open vectors file: %s\n", strerror(errno));
    free(query);
    return 1;
  }

  struct stat st;
  if (fstat(fd, &st) != 0) {
    fprintf(stderr, "failed to stat vectors file: %s\n", strerror(errno));
    close(fd);
    free(query);
    return 1;
  }

  if (st.st_size == 0) {
    close(fd);
    free(query);
    return 0;
  }

  if ((size_t)st.st_size % vector_bytes != 0) {
    fprintf(stderr, "vectors file size is not aligned to dimension\n");
    close(fd);
    free(query);
    return 1;
  }

  size_t vector_count = (size_t)st.st_size / vector_bytes;
  void *mapped = mmap(NULL, (size_t)st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
  if (mapped == MAP_FAILED) {
    fprintf(stderr, "mmap failed: %s\n", strerror(errno));
    close(fd);
    free(query);
    return 1;
  }

  const float *vectors = (const float *)mapped;
  Match *matches = calloc(top_k, sizeof(Match));
  if (!matches) {
    fprintf(stderr, "allocation failed\n");
    munmap(mapped, (size_t)st.st_size);
    close(fd);
    free(query);
    return 1;
  }

  for (size_t i = 0; i < vector_count; i++) {
    const float *vector = vectors + (i * dimension);
    float score = 0.0f;
    for (size_t j = 0; j < dimension; j++) {
      score += query[j] * vector[j];
    }
    insert_match(matches, top_k, (ssize_t)i, score);
  }

  for (size_t i = 0; i < top_k; i++) {
    if (!matches[i].filled) continue;
    printf("%zd\t%.8f\n", matches[i].index, matches[i].score);
  }

  free(matches);
  munmap(mapped, (size_t)st.st_size);
  close(fd);
  free(query);
  return 0;
}
