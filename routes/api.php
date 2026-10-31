<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Phattarachai\Kradan\Http\Controllers\Api\TokenController;

Route::post('push', [TokenController::class, 'push'])->name('push');
Route::get('boards', [TokenController::class, 'boards'])->name('boards');
Route::get('boards/{slug}/review', [TokenController::class, 'review'])->name('review');
Route::post('boards/{slug}/decide', [TokenController::class, 'decide'])->name('decide');
Route::get('boards/{slug}/shares', [TokenController::class, 'shares'])->name('shares.index');
Route::post('boards/{slug}/shares', [TokenController::class, 'share'])->name('shares.store');
Route::delete('shares/{share}', [TokenController::class, 'revoke'])->whereNumber('share')->name('shares.destroy');
