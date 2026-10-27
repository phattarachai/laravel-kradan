<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Tests;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\View;
use Orchestra\Testbench\TestCase as Orchestra;
use Override;
use Phattarachai\Kradan\Kradan;
use Phattarachai\Kradan\KradanServiceProvider;
use Phattarachai\Kradan\Tests\Fixtures\User;

/**
 * A minimal host: SQLite in memory, an authenticatable, a `login` route, a
 * faked disk and placeholder board views that print the boot payload.
 */
abstract class TestCase extends Orchestra
{
    /** @var array<string, mixed> config applied before the provider boots */
    protected array $config = [];

    #[Override]
    protected function setUp(): void
    {
        parent::setUp();

        $this->prepareHost();
    }

    #[Override]
    protected function tearDown(): void
    {
        Kradan::flush();

        parent::tearDown();
    }

    /**
     * Rebuild the app with config the provider reads at boot (routes,
     * channels). The database is not migrated again.
     *
     * @param  array<string, mixed>  $config
     */
    public function rebootWith(array $config): void
    {
        $this->config = $config;
        $this->refreshApplication();
        $this->prepareHost();
    }

    /**
     * @return list<class-string>
     */
    #[Override]
    protected function getPackageProviders($app): array
    {
        return [KradanServiceProvider::class];
    }

    #[Override]
    protected function defineEnvironment($app): void
    {
        $config = $app['config'];

        $config->set('database.default', 'sqlite');
        $config->set('database.connections.sqlite', ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true]);
        $config->set('auth.providers.users.model', User::class);
        $config->set('kradan.enabled', true);
        $config->set('kradan.presence', 'auto');
        $config->set('kradan.content_url', null);
        $config->set('kradan.tokens', [hash('sha256', 'test-token')]);
        $config->set('kradan.locale', 'th');
        $config->set('app.url', 'http://localhost');

        foreach ($this->config as $key => $value) {
            $config->set($key, $value);
        }
    }

    protected function defineRoutes($router): void
    {
        Route::get('/login', fn (): string => 'login')->name('login');
    }

    #[Override]
    protected function defineDatabaseMigrations(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/database/migrations');
    }

    private function prepareHost(): void
    {
        Http::preventStrayRequests();
        Storage::fake('local');
        View::prependNamespace('kradan', __DIR__.'/Fixtures/views');

        Kradan::flush();
        Kradan::auth(fn ($user, string $panel, string $ability): bool => true);
    }
}
