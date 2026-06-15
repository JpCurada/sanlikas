/**
 * Binary min-heap keyed on `f` (A* priority). Ported from the LIKAS routing
 * service; kept dependency-free so the A* core stays unit-testable in isolation.
 */
export class MinHeap {
  private heap: Array<{ id: number; f: number }> = [];

  size(): number {
    return this.heap.length;
  }

  push(item: { id: number; f: number }): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): { id: number; f: number } | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[i].f < this.heap[parent].f) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else break;
    }
  }

  private sinkDown(i: number): void {
    const n = this.heap.length;
    for (;;) {
      const l = i * 2 + 1;
      const r = i * 2 + 2;
      let smallest = i;
      if (l < n && this.heap[l].f < this.heap[smallest].f) smallest = l;
      if (r < n && this.heap[r].f < this.heap[smallest].f) smallest = r;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}
