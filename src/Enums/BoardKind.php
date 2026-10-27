<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Enums;

enum BoardKind: string
{
    case Flow = 'flow';
    case Decision = 'decision';
}
