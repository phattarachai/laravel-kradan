<?php

declare(strict_types=1);

use Phattarachai\Kradan\Models\Board;

it('puts the task ref before the title only when the title does not already start with it', function (): void {
    $cases = [
        ['T156', 'ราคาหลังลูกค้าส่งคำสั่งซื้อ', 'T156 ราคาหลังลูกค้าส่งคำสั่งซื้อ'],
        ['T156', 'T156 ราคาหลังลูกค้าส่งคำสั่งซื้อ', 'T156 ราคาหลังลูกค้าส่งคำสั่งซื้อ'],
        ['T156', 't156: ราคา', 't156: ราคา'],
        ['T156', 'T1560 อื่น', 'T156 T1560 อื่น'],
        [null, 'ไม่มีงาน', 'ไม่มีงาน'],
        ['', ' เว้นวรรค ', 'เว้นวรรค'],
    ];

    foreach ($cases as [$ref, $title, $label]) {
        expect(Board::labelFor($ref, $title))->toBe($label, "{$ref} / {$title}");
    }
});
