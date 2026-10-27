<?php

declare(strict_types=1);

namespace Phattarachai\Kradan;

use Closure;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Auth\UserProvider;
use Illuminate\Support\Facades\Auth;
use Phattarachai\Kradan\Enums\Ability;
use Phattarachai\Kradan\Enums\BoardKind;

/**
 * The host registers who may open which panel, and how a user is shown:
 *
 *   Kradan::auth(fn ($user, string $panel, string $ability) => $user->isAdmin());
 *   Kradan::userUsing(fn ($user) => ['id' => $user->id, 'name' => $user->name, 'avatar' => $user->avatar_url]);
 */
final class Kradan
{
    public const string VERSION = '0.1.0';

    /** @var (Closure(Authenticatable, string, string): bool)|null */
    private static ?Closure $authUsing = null;

    /** @var (Closure(Authenticatable): array{id: mixed, name: string, avatar?: ?string})|null */
    private static ?Closure $userUsing = null;

    /** @var array<string, array{id: mixed, name: string, avatar: ?string}> */
    private static array $users = [];

    /**
     * @param  Closure(Authenticatable, string, string): bool  $callback
     */
    public static function auth(Closure $callback): void
    {
        self::$authUsing = $callback;
    }

    /**
     * @param  Closure(Authenticatable): array{id: mixed, name: string, avatar?: ?string}  $callback
     */
    public static function userUsing(Closure $callback): void
    {
        self::$userUsing = $callback;
        self::$users = [];
    }

    public static function allows(?Authenticatable $user, string $panel, Ability $ability): bool
    {
        if (! $user instanceof Authenticatable || self::panel($panel) === null) {
            return false;
        }

        if (self::$authUsing instanceof Closure) {
            return (bool) call_user_func(self::$authUsing, $user, $panel, $ability->value);
        }

        return app()->environment('local');
    }

    public static function allowsAny(?Authenticatable $user, Ability $ability = Ability::View): bool
    {
        return collect(array_keys(self::panels()))
            ->contains(fn (string $panel): bool => self::allows($user, $panel, $ability));
    }

    /** @return list<string> */
    public static function viewablePanels(?Authenticatable $user): array
    {
        return array_values(array_filter(
            array_keys(self::panels()),
            fn (string $panel): bool => self::allows($user, $panel, Ability::View),
        ));
    }

    /** @return array<string, array{kind: string, title: string}> */
    public static function panels(): array
    {
        return (array) config('kradan.panels', []);
    }

    /** @return array{kind: string, title: string}|null */
    public static function panel(string $panel): ?array
    {
        return self::panels()[$panel] ?? null;
    }

    public static function panelFor(BoardKind $kind): string
    {
        return (string) collect(self::panels())
            ->search(fn (array $panel): bool => $panel['kind'] === $kind->value);
    }

    public static function user(): ?Authenticatable
    {
        return Auth::guard(config('kradan.guard'))->user();
    }

    /**
     * @return array{id: mixed, name: string, avatar: ?string}
     */
    public static function present(Authenticatable $user): array
    {
        $shape = self::$userUsing instanceof Closure
            ? call_user_func(self::$userUsing, $user)
            : ['id' => $user->getAuthIdentifier(), 'name' => (string) ($user->name ?? $user->getAuthIdentifier())];

        return ['id' => $shape['id'], 'name' => (string) $shape['name'], 'avatar' => $shape['avatar'] ?? null];
    }

    /**
     * @return array{id: mixed, name: string, avatar: ?string}
     */
    public static function userById(?string $id): array
    {
        if ($id === null) {
            return ['id' => null, 'name' => 'Claude', 'avatar' => null];
        }

        return self::$users[$id] ??= self::lookup($id);
    }

    public static function presenceMode(): string
    {
        $mode = (string) config('kradan.presence', 'auto');

        if ($mode !== 'auto') {
            return $mode;
        }

        return config('broadcasting.default') === 'reverb' ? 'reverb' : 'polling';
    }

    /**
     * Copy in Kradan's own locale, whatever the request's locale is.
     *
     * @param  array<string, mixed>  $replace
     */
    public static function trans(string $key, array $replace = []): string
    {
        return (string) trans("kradan::ui.{$key}", $replace, (string) config('kradan.locale', 'th'));
    }

    public static function flush(): void
    {
        self::$authUsing = null;
        self::$userUsing = null;
        self::$users = [];
    }

    /**
     * @return array{id: mixed, name: string, avatar: ?string}
     */
    private static function lookup(string $id): array
    {
        $user = self::provider()?->retrieveById($id);

        return $user instanceof Authenticatable
            ? self::present($user)
            : ['id' => $id, 'name' => self::trans('unknown_user', ['id' => $id]), 'avatar' => null];
    }

    private static function provider(): ?UserProvider
    {
        $guard = config('kradan.guard') ?? config('auth.defaults.guard');
        $provider = config("auth.guards.{$guard}.provider");

        return is_string($provider) ? Auth::createUserProvider($provider) : null;
    }
}
