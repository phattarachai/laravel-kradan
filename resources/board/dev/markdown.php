<?php

/* The dev harness renders a fixture's index.md with the package's own MarkdownPage, as kradan:push does. */

declare(strict_types=1);
use Phattarachai\Kradan\Support\MarkdownPage;

require __DIR__.'/../../../vendor/autoload.php';

$page = (new MarkdownPage)->render((string) file_get_contents($argv[1]), basename(dirname($argv[1])));
echo json_encode($page, JSON_UNESCAPED_UNICODE);
