<?php

declare(strict_types=1);

namespace Phattarachai\Kradan;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Override;
use Phattarachai\Kradan\Console\DecideCommand;
use Phattarachai\Kradan\Console\DoctorCommand;
use Phattarachai\Kradan\Console\ListCommand;
use Phattarachai\Kradan\Console\PullCommand;
use Phattarachai\Kradan\Console\PushCommand;
use Phattarachai\Kradan\Console\TokenCommand;
use Phattarachai\Kradan\Enums\Ability;
use Phattarachai\Kradan\Http\Middleware\ApplyLocale;
use Phattarachai\Kradan\Http\Middleware\AuthenticateToken;
use Phattarachai\Kradan\Http\Middleware\Authorize;
use Phattarachai\Kradan\Models\Board;

final class KradanServiceProvider extends ServiceProvider
{
    #[Override]
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/kradan.php', 'kradan');
    }

    public function boot(): void
    {
        $this->loadTranslationsFrom(__DIR__.'/../lang', 'kradan');
        $this->loadViewsFrom(__DIR__.'/../resources/views', 'kradan');
        $this->loadMigrationsFrom(__DIR__.'/../database/migrations');

        if ((bool) config('kradan.enabled')) {
            $this->registerRoutes();
            $this->registerChannel();
        }

        if ($this->app->runningInConsole()) {
            $this->registerPublishing();
            $this->commands([
                DoctorCommand::class,
                TokenCommand::class,
                PushCommand::class,
                PullCommand::class,
                ListCommand::class,
                DecideCommand::class,
            ]);
        }
    }

    private function registerRoutes(): void
    {
        $path = trim((string) config('kradan.path', 'kradan'), '/');

        Route::group([
            'prefix' => $path,
            'as' => 'kradan.',
        ], fn () => $this->loadRoutesFrom(__DIR__.'/../routes/content.php'));

        Route::group([
            'prefix' => "{$path}/api/v1",
            'middleware' => [ApplyLocale::class, 'throttle:'.config('kradan.throttle', '60,1'), AuthenticateToken::class],
            'as' => 'kradan.v1.',
        ], fn () => $this->loadRoutesFrom(__DIR__.'/../routes/api.php'));

        Route::group([
            'domain' => config('kradan.domain'),
            'prefix' => $path,
            'middleware' => [...(array) config('kradan.middleware', ['web']), ApplyLocale::class, Authorize::class],
            'as' => 'kradan.',
        ], fn () => $this->loadRoutesFrom(__DIR__.'/../routes/web.php'));
    }

    private function registerChannel(): void
    {
        if (Kradan::presenceMode() !== 'reverb') {
            return;
        }

        Broadcast::channel('kradan.board.{id}', function (Authenticatable $user, string $id): array|false {
            $board = Board::query()->find((int) $id);

            return $board instanceof Board && Kradan::allows($user, Ability::View)
                ? Kradan::present($user)
                : false;
        }, array_filter(['guards' => config('kradan.guard') === null ? null : [config('kradan.guard')]]));
    }

    private function registerPublishing(): void
    {
        $this->publishes([
            __DIR__.'/../config/kradan.php' => config_path('kradan.php'),
        ], 'kradan-config');

        $this->publishes([
            __DIR__.'/../database/migrations' => database_path('migrations'),
        ], 'kradan-migrations');

        $this->publishes([
            __DIR__.'/../lang' => lang_path('vendor/kradan'),
        ], 'kradan-lang');
    }
}
