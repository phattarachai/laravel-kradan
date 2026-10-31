<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Enums;

/**
 * A decision board asks users to pick and comment; a deck (`<body data-k-deck>`) is slides to review and
 * present, with no decided flow.
 */
enum BoardKind: string
{
    case Decision = 'decision';
    case Deck = 'deck';
}
