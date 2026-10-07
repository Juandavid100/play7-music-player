import { test } from "node:test";
import assert from "node:assert/strict";
import { DoublyLinkedList } from "../src/structures/DoublyLinkedList";
import { backward, forward, isConsistent, song } from "./helpers";

function build(titles: string): DoublyLinkedList {
    const list = new DoublyLinkedList();
    for (const title of titles.split(" ").filter(Boolean)) list.addLast(song(title));
    return list;
}

test("empty list has no head, no tail and size 0", () => {
    const list = new DoublyLinkedList();
    assert.equal(list.head, null);
    assert.equal(list.tail, null);
    assert.equal(list.size, 0);
    assert.equal(list.getAt(0), null);
    assert.equal(list.removeAt(0), null);
    assert.equal(list.find("x"), null);
    assert.equal(list.move(0, 1), false);
});

test("single element is both head and tail", () => {
    const list = build("A");
    assert.equal(list.head, list.tail);
    assert.equal(list.head!.prev, null);
    assert.equal(list.head!.next, null);
});

test("addFirst and addLast keep both directions linked", () => {
    const list = build("B C");
    list.addFirst(song("A"));
    list.addLast(song("D"));
    assert.equal(forward(list), "A B C D");
    assert.equal(backward(list), "D C B A");
    assert.ok(isConsistent(list));
});

test("insert at start, middle, end and invalid positions", () => {
    const list = build("B D");
    list.insert(0, song("A"));
    list.insert(2, song("C"));
    list.insert(4, song("E"));
    assert.equal(forward(list), "A B C D E");
    assert.equal(backward(list), "E D C B A");
    assert.equal(list.insert(9, song("X")), null);
    assert.equal(list.insert(-1, song("X")), null);
    assert.equal(list.size, 5);
    assert.ok(isConsistent(list));
});

test("getAt, find and indexOf", () => {
    const list = build("A B C D E");
    assert.equal(list.getAt(0)!.song.title, "A");
    assert.equal(list.getAt(3)!.song.title, "D");
    assert.equal(list.getAt(4)!.song.title, "E");
    assert.equal(list.getAt(5), null);
    const c = list.find("id-C")!;
    assert.equal(c.song.title, "C");
    assert.equal(list.indexOf(c), 2);
});

test("remove head, middle, tail and the only element", () => {
    const list = build("A B C D");
    list.remove(list.find("id-A")!);
    assert.equal(forward(list), "B C D");
    list.remove(list.find("id-C")!);
    assert.equal(forward(list), "B D");
    list.remove(list.find("id-D")!);
    assert.equal(forward(list), "B");
    assert.ok(isConsistent(list));
    list.remove(list.find("id-B")!);
    assert.equal(list.size, 0);
    assert.ok(isConsistent(list));
});

test("removing a node that is not in the list changes nothing", () => {
    const list = build("A B");
    const other = build("Z");
    assert.equal(list.remove(other.head!), false);
    assert.equal(forward(list), "A B");
});

test("removed node keeps no links to the list", () => {
    const list = build("A B C");
    const b = list.find("id-B")!;
    list.remove(b);
    assert.equal(b.prev, null);
    assert.equal(b.next, null);
});

test("move in every direction keeps links consistent", () => {
    const list = build("A B C D");
    assert.ok(list.move(1, 0));
    assert.equal(forward(list), "B A C D");
    assert.ok(list.move(0, 3));
    assert.equal(forward(list), "A C D B");
    assert.ok(list.move(3, 1));
    assert.equal(forward(list), "A B C D");
    assert.ok(list.move(2, 2));
    assert.equal(backward(list), "D C B A");
    assert.equal(list.move(0, 4), false);
    assert.equal(list.move(7, 0), false);
    assert.ok(isConsistent(list));
});

test("move keeps the same node object", () => {
    const list = build("A B C");
    const b = list.find("id-B")!;
    list.move(1, 0);
    assert.equal(list.head, b);
    assert.equal(b.next!.song.title, "A");
});

test("clear empties the list", () => {
    const list = build("A B C");
    list.clear();
    assert.equal(list.size, 0);
    assert.ok(isConsistent(list));
});
