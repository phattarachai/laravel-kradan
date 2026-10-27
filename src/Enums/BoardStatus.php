<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Enums;

enum BoardStatus: string
{
    case Open = 'open';
    case Decided = 'decided';
}
