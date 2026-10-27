<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\View;
use Phattarachai\Kradan\Http\Controllers\AssetController;
use Phattarachai\Kradan\Kradan;
use Phattarachai\Kradan\Support\RoundPublisher;
use Throwable;

/**
 * Checks what Kradan needs from its host, so a broken install reports what is
 * missing instead of a blank board.
 */
final class DoctorCommand extends Command
{
    private const array TABLES = ['kradan_boards', 'kradan_rounds', 'kradan_picks', 'kradan_comments', 'kradan_viewers', 'kradan_activity', 'kradan_items'];

    protected $signature = 'kradan:doctor';

    protected $description = 'Check that this application satisfies the Kradan requirements';

    public function handle(): int
    {
        $failures = 0;

        $failures += $this->check('Kradan enabled', fn (): ?string => config('kradan.enabled') ? null : 'KRADAN_ENABLED is false, so every Kradan URL 404s.');
        $failures += $this->check('Routes registered', fn (): ?string => Route::has('kradan.index') ? null : 'Route [kradan.index] is missing.');
        $failures += $this->check('App key', fn (): ?string => config('app.key') ? null : 'APP_KEY is empty; content URLs are signed with it.');
        $failures += $this->check('Tables migrated', $this->tables(...));
        $failures += $this->check('Disk ['.config('kradan.disk').'] writable', $this->disk(...));
        $failures += $this->check('Board assets built', $this->assets(...));
        $failures += $this->check('Views', fn (): ?string => View::exists('kradan::board') && View::exists('kradan::index') ? null : 'kradan::board or kradan::index is missing.');
        $failures += $this->check('Guest login route', $this->loginRoute(...));
        $failures += $this->check('Token API', fn (): ?string => config('kradan.tokens') === [] ? 'KRADAN_TOKEN_HASHES is empty, so kradan:push cannot reach this app (fine on a developer checkout).' : null);

        $this->components->twoColumnDetail('Presence', Kradan::presenceMode());
        $this->components->twoColumnDetail('Content served from', config('kradan.content_url') ?: 'the app\'s own host (sandboxed)');
        $this->newLine();

        if ($failures === 0) {
            $this->components->info('Kradan looks correctly installed.');

            return self::SUCCESS;
        }

        $this->components->error("{$failures} check(s) need attention.");

        return self::FAILURE;
    }

    /**
     * @param  callable(): (string|null)  $check
     */
    private function check(string $label, callable $check): int
    {
        try {
            $problem = $check();
        } catch (Throwable $throwable) {
            $problem = $throwable->getMessage();
        }

        $this->components->twoColumnDetail($label, $problem === null ? '<fg=green>OK</>' : '<fg=red>FAIL</>');

        if ($problem !== null) {
            $this->line("  <fg=gray>{$problem}</>");

            return 1;
        }

        return 0;
    }

    /**
     * A guest is sent to `redirect_guests_to`; a name that is not a route
     * leaves them on a 403 instead.
     */
    private function loginRoute(): ?string
    {
        $target = config('kradan.redirect_guests_to');

        if (! is_string($target) || $target === '' || Route::has($target) || str_contains($target, '/')) {
            return null;
        }

        return "redirect_guests_to [{$target}] is not a route, so guests get a 403. Set KRADAN_LOGIN_ROUTE to your login route (Filament: filament.admin.auth.login).";
    }

    private function tables(): ?string
    {
        $schema = Schema::connection(config('kradan.connection'));
        $missing = array_values(array_filter(self::TABLES, fn (string $table): bool => ! $schema->hasTable($table)));

        return $missing === [] ? null : 'Run `php artisan migrate`; missing: '.implode(', ', $missing).'.';
    }

    private function disk(): ?string
    {
        $disk = RoundPublisher::disk();
        $probe = 'kradan/.doctor';
        $disk->put($probe, 'ok');
        $ok = $disk->get($probe) === 'ok';
        $disk->delete($probe);

        return $ok ? null : 'Could not write and read back a file.';
    }

    private function assets(): ?string
    {
        $missing = array_values(array_filter(['board.js', 'board.css', 'agent.js'], fn (string $file): bool => ! is_file(AssetController::path($file))));

        return $missing === [] ? null : 'dist/ is missing '.implode(', ', $missing).'; reinstall the package.';
    }
}
