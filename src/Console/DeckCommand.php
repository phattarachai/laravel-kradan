<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Phattarachai\Kradan\Http\Controllers\AssetController;
use Phattarachai\Kradan\Http\Controllers\ContentController;

/**
 * A local preview of a deck before any push: copies this package's deck runtime into `<dir>/kradan-deck/`
 * and links it from a `kradan:deck` block in the head. Opened directly (any static server, or the file
 * itself), the page then shows one slide at a time with the keys present mode uses. The block and the
 * folder never reach the board: kradan:push leaves the folder out and the server strips the block and
 * injects its own runtime.
 */
final class DeckCommand extends Command
{
    public const string FOLDER = 'kradan-deck';

    private const string BLOCK = '/[ \t]*<!-- kradan:deck:start -->.*?<!-- kradan:deck:end -->\n?/s';

    protected $signature = 'kradan:deck {dir : the deck folder, e.g. public/design/<slug>}';

    protected $description = 'Put the deck runtime into a deck folder so it previews locally before a push';

    public function handle(): int
    {
        $dir = rtrim((string) $this->argument('dir'), '/');
        $page = "{$dir}/index.html";

        if (! File::isFile($page)) {
            $this->components->error("{$page} not found.");

            return self::FAILURE;
        }

        $html = File::get($page);

        if (! ContentController::isDeck($html)) {
            $this->components->error("{$page} is not a deck: add data-k-deck to its <body>.");

            return self::FAILURE;
        }

        File::ensureDirectoryExists("{$dir}/".self::FOLDER);

        foreach (['deck.js', 'deck.css'] as $file) {
            File::copy(AssetController::path($file), "{$dir}/".self::FOLDER."/{$file}");
        }

        File::put($page, self::withBlock($html));
        $this->components->info("Deck runtime → {$dir}/".self::FOLDER.'/. Open index.html to preview: ← → Space, F fullscreen, B black.');

        return self::SUCCESS;
    }

    public static function withBlock(string $html): string
    {
        $folder = self::FOLDER;
        $block = "<!-- kradan:deck:start --><link rel=\"stylesheet\" href=\"{$folder}/deck.css\"><script src=\"{$folder}/deck.js\" defer></script><!-- kradan:deck:end -->\n";
        $html = (string) preg_replace(self::BLOCK, '', $html);
        $at = stripos($html, '</head>');

        if ($at !== false) {
            return substr_replace($html, $block, $at, 0);
        }

        $body = preg_match('/<body\b[^>]*>/i', $html, $match, PREG_OFFSET_CAPTURE) === 1 ? $match[0][1] : 0;

        return substr_replace($html, $block, $body, 0);
    }
}
